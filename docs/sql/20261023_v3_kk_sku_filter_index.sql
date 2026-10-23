-- Licensed to the Apache Software Foundation (ASF) under one
-- or more contributor license agreements. See the NOTICE file
-- distributed with this work for additional information
-- regarding copyright ownership. The ASF licenses this file
-- to you under the Apache License, Version 2.0 (the
-- "License"); you may not use this file except in compliance
-- with the License. You may obtain a copy of the License at
--
--   http://www.apache.org/licenses/LICENSE-2.0
--
-- Unless required by applicable law or agreed to in writing,
-- software distributed under the License is distributed on an
-- "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
-- KIND, either express or implied. See the License for the
-- specific language governing permissions and limitations
-- under the License.

-- Run only against the database serving public.profit_dws_daily_v3_usd.
-- No enclosing transaction: CONCURRENTLY keeps ingestion and chart reads available.
-- Existing (filter_column, biz_day) B-trees continue to serve exact/short searches.
SET lock_timeout = '2s';
SET statement_timeout = '180s';
SET maintenance_work_mem = '64MB';
SET max_parallel_maintenance_workers = 0;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_v3_filter_kk_sku_trgm
    ON public.profit_dws_daily_v3_usd USING gin (kk_sku gin_trgm_ops);
-- Verify indisvalid and compare real cascade SQL with EXPLAIN (ANALYZE, BUFFERS).
-- Revert only this optional index with DROP INDEX CONCURRENTLY, if required.
