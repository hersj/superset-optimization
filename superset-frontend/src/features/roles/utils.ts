/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { SupersetClient } from '@superset-ui/core';
import { t } from '@apache-superset/core/translation';
import rison from 'rison';
import { SelectOption } from './types';

export const createRole = async (name: string) =>
  SupersetClient.post({
    endpoint: '/api/v1/security/roles/',
    jsonPayload: { name },
  });

export const updateRolePermissions = async (
  roleId: number,
  permissionIds: number[],
) =>
  SupersetClient.post({
    endpoint: `/api/v1/security/roles/${roleId}/permissions`,
    jsonPayload: { permission_view_menu_ids: permissionIds },
  });

export const updateRoleUsers = async (roleId: number, userIds: number[]) =>
  SupersetClient.put({
    endpoint: `/api/v1/security/roles/${roleId}/users`,
    jsonPayload: { user_ids: userIds },
  });

export const updateRoleGroups = async (roleId: number, groupIds: number[]) =>
  SupersetClient.put({
    endpoint: `/api/v1/security/roles/${roleId}/groups`,
    jsonPayload: { group_ids: groupIds },
  });

export const updateRoleName = async (roleId: number, name: string) =>
  SupersetClient.put({
    endpoint: `/api/v1/security/roles/${roleId}`,
    jsonPayload: { name },
  });

export const formatPermissionLabel = (
  permissionName: string,
  viewMenuName: string,
) => `${permissionName.replace(/_/g, ' ')} ${viewMenuName.replace(/_/g, ' ')}`;

type PermissionResult = {
  id: number;
  permission: { name: string };
  view_menu: { name: string };
};

const mapPermissionResults = (results: PermissionResult[]) =>
  results.map(item => ({
    value: item.id,
    label: formatPermissionLabel(item.permission.name, item.view_menu.name),
  }));

const PAGE_SIZE = 1000;
const CONCURRENCY_LIMIT = 3;
const MAX_CACHE_ENTRIES = 20;
const permissionSearchCache = new Map<string, SelectOption[]>();

// 统一搜索词和展示标签的下划线、大小写，保证输入 `dataset_one` 与界面展示的
// `dataset one` 都能命中同一权限。
const normalizePermissionSearchText = (value: string) =>
  value.replace(/_/g, ' ').trim().toLowerCase();

export const clearPermissionSearchCache = () => {
  permissionSearchCache.clear();
};

const fetchPermissionPageRaw = async (queryParams: Record<string, unknown>) => {
  const response = await SupersetClient.get({
    endpoint: `/api/v1/security/permissions-resources/?q=${rison.encode(queryParams)}`,
  });
  return {
    data: mapPermissionResults(response.json?.result || []),
    totalCount: response.json?.count ?? 0,
  };
};

const fetchAllPermissionPages = async (
  filters?: Record<string, unknown>[],
): Promise<SelectOption[]> => {
  const page0 = await fetchPermissionPageRaw({
    page: 0,
    page_size: PAGE_SIZE,
    ...(filters?.length ? { filters } : {}),
  });
  if (page0.data.length === 0 || page0.data.length >= page0.totalCount) {
    return page0.data;
  }

  // Use actual returned size — backend may cap below PAGE_SIZE
  const actualPageSize = page0.data.length;
  const totalPages = Math.ceil(page0.totalCount / actualPageSize);
  const allResults = [...page0.data];

  // Fetch remaining pages in batches of CONCURRENCY_LIMIT
  for (let batch = 1; batch < totalPages; batch += CONCURRENCY_LIMIT) {
    const batchEnd = Math.min(batch + CONCURRENCY_LIMIT, totalPages);
    const batchResults = await Promise.all(
      Array.from({ length: batchEnd - batch }, (_, i) =>
        fetchPermissionPageRaw({
          page: batch + i,
          page_size: PAGE_SIZE,
          ...(filters?.length ? { filters } : {}),
        }),
      ),
    );
    for (const r of batchResults) {
      allResults.push(...r.data);
      if (r.data.length === 0) return allResults;
    }
    if (allResults.length >= page0.totalCount) break;
  }

  return allResults;
};

export const fetchPermissionOptions = async (
  filterValue: string,
  page: number,
  pageSize: number,
  addDangerToast: (msg: string) => void,
) => {
  /**
   * 功能审计（可重写规格）：角色编辑页的权限搜索
   * - 功能目的与触发方式：管理员在“角色”编辑弹窗的权限选择框输入关键词时调用，返回可分页选择的权限；空关键词仍按当前页向服务端取数。
   * - 输入契约：filterValue 为用户输入；page/pageSize 为前端分页；权限接口返回 id、permission.name、view_menu.name；addDangerToast 用于可见错误提示。
   * - 输出契约：成功时返回 { data: SelectOption[], totalCount }；失败时仅提示“获取权限时出错”并返回空结果，不修改任何角色或权限。
   * - 处理流程：有搜索词时先以无筛选分页读取全部权限，再以格式化后的“权限名 资源名”在浏览器做包含匹配、缓存最多 20 个搜索词，最后切片分页。
   * - 业务规则：搜索忽略大小写，且下划线与空格等价；一个权限关联在无筛选接口中只出现一次，结果不重复；空搜索不读取或清除搜索缓存。
   * - 状态与副作用：仅请求 GET 接口并更新模块内搜索缓存；不写数据库、不变更角色、用户或用户组。
   * - 外部依赖：依赖 /api/v1/security/permissions-resources/ 的无筛选分页响应；该环境的后端不允许 permission.name、view_menu.name 作为 REST 筛选列，因此搜索不得发送这两个筛选字段。
   * - 异常与边界：接口失败、分页为空或后端限制页大小时返回已取得的安全结果；请求异常只显示一次错误提示。
   * - 不变量与约束：不得再向该接口发送 permission.name 或 view_menu.name 的 filters，以避免 HTTP 400；缓存上限为 20，超限淘汰最早项。
   * - 验证方式：utils.test.ts 覆盖无筛选请求、客户端匹配、缓存分页、空搜索、失败提示、后端分页限制及并发页读取。
   */
  if (!filterValue) {
    try {
      return await fetchPermissionPageRaw({ page, page_size: pageSize });
    } catch {
      addDangerToast(t('There was an error while fetching permissions'));
      return { data: [], totalCount: 0 };
    }
  }

  try {
    const cacheKey = normalizePermissionSearchText(filterValue);
    let cached = permissionSearchCache.get(cacheKey);
    if (!cached) {
      const allPermissions = await fetchAllPermissionPages();
      cached = allPermissions.filter(item =>
        normalizePermissionSearchText(item.label).includes(cacheKey),
      );
      if (permissionSearchCache.size >= MAX_CACHE_ENTRIES) {
        const oldestKey = permissionSearchCache.keys().next().value;
        if (oldestKey !== undefined) {
          permissionSearchCache.delete(oldestKey);
        }
      }
      permissionSearchCache.set(cacheKey, cached);
    }

    const start = page * pageSize;
    return {
      data: cached.slice(start, start + pageSize),
      totalCount: cached.length,
    };
  } catch {
    addDangerToast(t('There was an error while fetching permissions'));
    return { data: [], totalCount: 0 };
  }
};

export const fetchGroupOptions = async (
  filterValue: string,
  page: number,
  pageSize: number,
  addDangerToast: (msg: string) => void,
) => {
  const query = rison.encode({
    page,
    page_size: pageSize,
    ...(filterValue
      ? { filters: [{ col: 'name', opr: 'ct', value: filterValue }] }
      : {}),
  });

  try {
    const response = await SupersetClient.get({
      endpoint: `/api/v1/security/groups/?q=${query}`,
    });

    const results = response.json?.result || [];
    return {
      data: results.map((group: { id: number; name: string }) => ({
        value: group.id,
        label: group.name,
      })),
      totalCount: response.json?.count ?? 0,
    };
  } catch {
    addDangerToast(t('There was an error while fetching groups'));
    return { data: [], totalCount: 0 };
  }
};
