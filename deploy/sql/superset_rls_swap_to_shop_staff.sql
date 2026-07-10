-- ============================================================================
-- Superset RLS 切换：从 shop_management_assignments(9列) → shop_staff + operators
-- 目标库：Superset 元数据库 (superset-db-1, db=superset)，表 row_level_security_filters
-- 影响：id=2「店铺数据控制」(列 "店铺ID")、id=3「看板行级管理」(列 "shop_id")
--
-- Level 1：登录仍是中文名，经 operators.login_username 桥接到 operator_id。
-- 前置：已应用 create_operators_and_shop_staff.sql 并通过权限等价性验证（0 行差异）。
-- ============================================================================

-- ---- 回滚备份（切换前的原始 clause，如需回退执行这两条）---------------------
-- UPDATE row_level_security_filters SET clause =
--   '"店铺ID" IN (   SELECT shop_id   FROM shop_management_assignments   WHERE ''{{ current_username() }}'' IN (     operations_lead,     NULLIF(operator_1, ''''),     NULLIF(operator_2, ''''),     NULLIF(operator_3, ''''),     NULLIF(operator_4, ''''),     NULLIF(operator_5, ''''),     NULLIF(operator_6, ''''),     NULLIF(operator_7, ''''),     NULLIF(operator_8, '''')   ) )'
-- WHERE id = 2;
-- UPDATE row_level_security_filters SET clause =
--   '"shop_id" IN (   SELECT shop_id   FROM shop_management_assignments   WHERE ''{{ current_username() }}'' IN (     operations_lead,     NULLIF(operator_1, ''''),     NULLIF(operator_2, ''''),     NULLIF(operator_3, ''''),     NULLIF(operator_4, ''''),     NULLIF(operator_5, ''''),     NULLIF(operator_6, ''''),     NULLIF(operator_7, ''''),     NULLIF(operator_8, '''')   ) )'
-- WHERE id = 3;

-- ---- 切换为 shop_staff -------------------------------------------------------
UPDATE row_level_security_filters
SET clause = $clause$"店铺ID" IN (
  SELECT ss.shop_id
  FROM shop_staff ss
  JOIN operators o ON o.operator_id = ss.operator_id
  WHERE o.login_username = '{{ current_username() }}' AND o.is_active
)$clause$
WHERE id = 2;

UPDATE row_level_security_filters
SET clause = $clause$"shop_id" IN (
  SELECT ss.shop_id
  FROM shop_staff ss
  JOIN operators o ON o.operator_id = ss.operator_id
  WHERE o.login_username = '{{ current_username() }}' AND o.is_active
)$clause$
WHERE id = 3;
