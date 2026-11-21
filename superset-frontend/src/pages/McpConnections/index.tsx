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
import { FormEvent, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { SupersetClient } from '@superset-ui/core';
import { styled } from '@apache-superset/core/theme';
import { t } from '@apache-superset/core/translation';
import { Button, Input, Modal } from '@superset-ui/core/components';
import type { BootstrapUser } from 'src/types/bootstrapTypes';

type Connection = {
  id: string;
  label: string;
  status: 'active' | 'revoked' | 'expired';
  expires_at: number;
};

const endpoint = '/api/v1/mcp_connections/';

const Layout = styled.main`
  max-width: 1120px;
  margin: 0 auto;
  padding: 36px 24px 56px;
  color: ${({ theme }) => theme.colorText};

  h1,
  h2,
  h3,
  p {
    margin: 0;
  }
  h1 {
    margin: 14px 0 6px;
    font-size: 32px;
  }
  h2 {
    margin-bottom: 6px;
    font-size: 18px;
  }
  h3 {
    font-size: 15px;
  }
  p,
  .secondary {
    color: ${({ theme }) => theme.colorTextSecondary};
  }

  .setup {
    display: grid;
    grid-template-columns: minmax(0, 5fr) minmax(0, 3fr);
    gap: 16px;
    align-items: start;
    margin: 24px 0 16px;
  }

  section,
  aside {
    min-width: 0;
    padding: 20px;
    background: ${({ theme }) => theme.colorBgContainer};
    border: 1px solid ${({ theme }) => theme.colorBorderSecondary};
    border-radius: ${({ theme }) => theme.borderRadiusLG}px;
  }

  aside,
  .receipt {
    background: ${({ theme }) => theme.colorPrimaryBg};
  }

  .fields {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(110px, 1fr);
    gap: 12px;
    margin: 16px 0;
  }

  label {
    display: grid;
    gap: 6px;
  }
  select {
    width: 100%;
    padding: 4px 10px;
    color: inherit;
    background: ${({ theme }) => theme.colorBgContainer};
    border: 1px solid ${({ theme }) => theme.colorBorder};
    border-radius: ${({ theme }) => theme.borderRadius}px;
  }
  :focus-visible {
    outline: 2px solid ${({ theme }) => theme.colorPrimary};
    outline-offset: 2px;
  }

  dl {
    margin: 12px 0;
  }
  dl div {
    display: flex;
    gap: 12px;
    margin: 6px 0;
  }
  dt {
    min-width: 66px;
    font-weight: 400;
  }
  dd {
    margin: 0;
  }
  .address {
    padding-top: 10px;
    border-top: 1px solid ${({ theme }) => theme.colorBorderSecondary};
  }
  code {
    overflow-wrap: anywhere;
    font-size: 12px;
  }
  .actions {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
    margin-top: 8px;
  }
  .receipt {
    margin-top: 16px;
    padding: 14px;
    border-radius: ${({ theme }) => theme.borderRadius}px;
  }
  .receipt p {
    margin: 5px 0;
  }
  .status-message {
    min-height: 22px;
    margin-top: 10px;
  }
  [role='alert'] {
    color: ${({ theme }) => theme.colorErrorText};
    margin-top: 8px;
  }

  .table-scroll {
    overflow-x: auto;
  }
  table {
    width: 100%;
    min-width: 460px;
    border-collapse: collapse;
    margin-top: 12px;
    text-align: left;
  }
  th,
  td {
    padding: 9px 10px;
    border-top: 1px solid ${({ theme }) => theme.colorBorderSecondary};
  }
  th {
    background: ${({ theme }) => theme.colorFillQuaternary};
    color: ${({ theme }) => theme.colorTextSecondary};
  }
  th:last-child,
  td:last-child {
    text-align: right;
  }
  td:first-child {
    overflow-wrap: anywhere;
  }
  tbody .active {
    color: ${({ theme }) => theme.colorSuccessText};
  }

  @media (max-width: 700px) {
    padding: 20px 16px;
    .setup,
    .fields {
      grid-template-columns: 1fr;
    }
    h1 {
      font-size: 26px;
    }
  }
`;

export default function McpConnections() {
  const user = useSelector((state: { user: BootstrapUser }) => state.user);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [label, setLabel] = useState('');
  const [days, setDays] = useState(30);
  const [created, setCreated] = useState<{ id: string; token: string }>();
  const [showToken, setShowToken] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<Connection>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [available, setAvailable] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const url = new URL('/mcp', window.location.origin).href;
  const date = new Intl.DateTimeFormat(document.documentElement.lang || 'en', {
    dateStyle: 'medium',
  });

  useEffect(() => {
    const controller = new AbortController();
    SupersetClient.get({ endpoint, signal: controller.signal })
      .then(({ json }) => {
        setConnections((json as { result: Connection[] }).result);
        setAvailable(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError(t('Could not load connections. Refresh to retry.'));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const { json } = await SupersetClient.post({
        endpoint,
        jsonPayload: { label: label.trim(), days },
      });
      const { result, token } = json as { result: Connection; token: string };
      setConnections(previous => [result, ...previous]);
      setCreated({ id: result.id, token });
      setShowToken(false);
      setLabel('');
      setMessage(t('Connection created.'));
    } catch {
      setError(t('Could not create the connection. Try again.'));
    } finally {
      setSaving(false);
    }
  }

  async function revoke() {
    if (!revokeTarget) return;
    setRevoking(true);
    setError('');
    setMessage('');
    try {
      await SupersetClient.delete({
        endpoint: endpoint + revokeTarget.id,
        parseMethod: 'raw',
      });
      setConnections(previous =>
        previous.map(item =>
          item.id === revokeTarget.id ? { ...item, status: 'revoked' } : item,
        ),
      );
      if (created?.id === revokeTarget.id) setCreated(undefined);
      setRevokeTarget(undefined);
      setMessage(t('Connection revoked.'));
    } catch {
      setError(t('Could not revoke the connection. Try again.'));
    } finally {
      setRevoking(false);
    }
  }

  async function copy(text: string) {
    setError('');
    setMessage('');
    try {
      await navigator.clipboard.writeText(text);
      setMessage(t('Copied.'));
    } catch {
      setError(t('Clipboard unavailable. Select the text to copy it.'));
    }
  }

  const statusLabel = {
    active: t('Active'),
    expired: t('Expired'),
    revoked: t('Revoked'),
  };

  return (
    <Layout>
      <div className="secondary">{t('Personal settings')}</div>
      <h1>{t('Connect AI Assistant')}</h1>
      <p>{t('Query your Superset charts and data from your AI assistant.')}</p>

      <div className="setup">
        <section aria-labelledby="mcp-create">
          <h2 id="mcp-create">{t('New connection')}</h2>
          <form onSubmit={create}>
            <div className="fields">
              <label>
                {t('Connection name')}
                <Input
                  value={label}
                  onChange={event => setLabel(event.target.value)}
                  maxLength={32}
                  placeholder={t('e.g. Work computer')}
                  autoComplete="off"
                  required
                />
              </label>
              <label>
                {t('Expires in')}
                <select
                  value={days}
                  onChange={event => setDays(Number(event.target.value))}
                >
                  {[7, 30, 90].map(value => (
                    <option key={value} value={value}>
                      {t('%s days', value)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <Button
              htmlType="submit"
              buttonStyle="primary"
              loading={saving}
              disabled={!available || !label.trim()}
            >
              {t('Create connection')}
            </Button>
          </form>
          {created && (
            <div className="receipt">
              <h3>{t('Connection created.')}</h3>
              <p>
                {t('Copy the configuration now. The token is shown only once.')}
              </p>
              <div className="actions">
                <code>{showToken ? created.token : '••••••••••••••••'}</code>
                <Button
                  buttonStyle="link"
                  aria-pressed={showToken}
                  onClick={() => setShowToken(previous => !previous)}
                >
                  {showToken ? t('Hide token') : t('Show token')}
                </Button>
              </div>
              <div className="actions">
                <Button
                  onClick={() =>
                    copy(
                      JSON.stringify(
                        {
                          mcpServers: {
                            superset: {
                              url,
                              headers: {
                                Authorization: `Bearer ${created.token}`,
                              },
                            },
                          },
                        },
                        null,
                        2,
                      ),
                    )
                  }
                >
                  {t('Copy connection configuration')}
                </Button>
                <Button buttonStyle="link" onClick={() => copy(created.token)}>
                  {t('Copy token')}
                </Button>
                <Button
                  buttonStyle="link"
                  onClick={() => setCreated(undefined)}
                >
                  {t('Done')}
                </Button>
              </div>
            </div>
          )}
        </section>

        <aside aria-labelledby="mcp-identity">
          <h2 id="mcp-identity">{t('Identity and permissions')}</h2>
          <dl>
            <div>
              <dt>{t('Username')}</dt>
              <dd>{user?.username}</dd>
            </div>
            <div>
              <dt>{t('Roles')}</dt>
              <dd>{Object.keys(user?.roles ?? {}).join(', ')}</dd>
            </div>
            <div>
              <dt>{t('Data access')}</dt>
              <dd>{t('Uses your Superset permissions')}</dd>
            </div>
          </dl>
          <div className="address">
            <strong>{t('Connection address')}</strong>
            <div className="actions">
              <code>{url}</code>
              <Button buttonStyle="link" onClick={() => copy(url)}>
                {t('Copy address')}
              </Button>
            </div>
          </div>
        </aside>
      </div>

      <section aria-labelledby="mcp-list">
        <h2 id="mcp-list">{t('My connections')}</h2>
        <p>
          {t(
            '%s active connections',
            connections.filter(item => item.status === 'active').length,
          )}
        </p>
        {loading && <p>{t('Loading...')}</p>}
        {available && connections.length === 0 && (
          <p>{t('Create a connection to get started.')}</p>
        )}
        {connections.length > 0 && (
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label={t('My connections')}
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">{t('Connection name')}</th>
                  <th scope="col">{t('Status')}</th>
                  <th scope="col">{t('Expiration date')}</th>
                  <th scope="col">{t('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {connections.map(connection => (
                  <tr key={connection.id}>
                    <td>{connection.label}</td>
                    <td className={connection.status}>
                      {statusLabel[connection.status]}
                    </td>
                    <td>
                      {date.format(new Date(connection.expires_at * 1000))}
                    </td>
                    <td>
                      {connection.status === 'active' && (
                        <Button
                          buttonStyle="link"
                          danger
                          aria-label={t('Revoke %s', connection.label)}
                          onClick={() => {
                            setError('');
                            setRevokeTarget(connection);
                          }}
                        >
                          {t('Revoke')}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="status-message" role="status">
        {message}
      </div>
      {error && !revokeTarget && <div role="alert">{error}</div>}
      {revokeTarget && (
        <Modal
          show
          title={t('Revoke connection')}
          onHide={() => setRevokeTarget(undefined)}
          footer={
            <>
              <Button
                onClick={() => setRevokeTarget(undefined)}
                disabled={revoking}
              >
                {t('Cancel')}
              </Button>
              <Button
                buttonStyle="primary"
                danger
                onClick={revoke}
                loading={revoking}
              >
                {t('Revoke connection')}
              </Button>
            </>
          }
        >
          <p>
            {t(
              '%s will lose access through this connection.',
              revokeTarget.label,
            )}
          </p>
          {error && <div role="alert">{error}</div>}
        </Modal>
      )}
    </Layout>
  );
}
