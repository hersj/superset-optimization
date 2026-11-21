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
import {
  act,
  render,
  screen,
  userEvent,
  within,
} from 'spec/helpers/testing-library';
import McpConnections from './index';

test('creates, copies and revokes a personal MCP connection', async () => {
  const connection = {
    id: 'b2a2f266-6f88-4c1c-8450-c17d264e8f6a',
    label: 'Work laptop',
    status: 'active',
    expires_at: 1893456000,
  };
  const get = jest.spyOn(SupersetClient, 'get').mockResolvedValue({
    response: new Response(),
    json: { result: [] },
  });
  const post = jest.spyOn(SupersetClient, 'post').mockResolvedValue({
    response: new Response(null, { status: 201 }),
    json: { result: connection, token: 'test-only-credential' },
  });
  const revoke = jest
    .spyOn(SupersetClient, 'delete')
    .mockResolvedValue(new Response(null, { status: 204 }));
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  render(<McpConnections />, { useRedux: true });

  await screen.findByText('Create a connection to get started.');
  const expiration = screen.getByRole('combobox', { name: 'Expires in' });
  expect(expiration).toHaveValue('30');
  expect(
    within(expiration).getByRole('option', { name: '180 days' }),
  ).toBeVisible();
  await userEvent.selectOptions(expiration, '365');
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Connection name' }),
    connection.label,
  );
  await act(async () => {
    userEvent.click(screen.getByRole('button', { name: 'Create connection' }));
  });
  const copyConfiguration = await screen.findByRole('button', {
    name: 'Copy connection configuration',
  });
  await act(async () => {
    userEvent.click(copyConfiguration);
  });
  expect(post).toHaveBeenCalledWith({
    endpoint: '/api/v1/mcp_connections/',
    jsonPayload: { label: connection.label, days: 365 },
  });
  expect(JSON.parse(writeText.mock.calls[0][0]).mcpServers.superset).toEqual({
    url: new URL('/mcp', window.location.origin).href,
    headers: { Authorization: 'Bearer test-only-credential' },
  });

  await userEvent.click(
    screen.getByRole('button', { name: `Revoke ${connection.label}` }),
  );
  await act(async () => {
    userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Revoke connection',
      }),
    );
  });
  expect(revoke).toHaveBeenCalledWith({
    endpoint: `/api/v1/mcp_connections/${connection.id}`,
    parseMethod: 'raw',
  });
  expect(await screen.findByText('Revoked')).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Copy connection configuration' }),
  ).not.toBeInTheDocument();
  Reflect.deleteProperty(navigator, 'clipboard');
  get.mockRestore();
  post.mockRestore();
  revoke.mockRestore();
});
