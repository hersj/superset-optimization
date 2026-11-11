-- Licensed to the Apache Software Foundation (ASF) under one
-- or more contributor license agreements.  See the NOTICE file
-- distributed with this work for additional information
-- regarding copyright ownership.  The ASF licenses this file
-- to you under the Apache License, Version 2.0 (the
-- "License"); you may not use this file except in compliance
-- with the License.  You may obtain a copy of the License at
--
--   http://www.apache.org/licenses/LICENSE-2.0
--
-- Unless required by applicable law or agreed to in writing,
-- software distributed under the License is distributed on an
-- "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
-- KIND, either express or implied.  See the License for the
-- specific language governing permissions and limitations
-- under the License.
{% set needs_bounds = 'cpc_cost_diff' in (metrics | default([], true) | tojson) %}
{% set selected_time = get_time_filter('biz_day', remove_filter=needs_bounds, as_predicate=True, require_bounded=needs_bounds) %}
WITH main AS NOT MATERIALIZED (
 SELECT * FROM public.profit_dws_daily_v3_usd WHERE {{ selected_time }}
), fees AS NOT MATERIALIZED (
 SELECT biz_day,shop_id,commodity_sku,asin,source_run_id,cpc_cost_diff
 FROM public.profit_dws_daily_v3_fee_detail_usd WHERE {{ selected_time }}
)
SELECT main.*,fees.cpc_cost_diff
FROM main LEFT JOIN fees
 ON (fees.biz_day,fees.shop_id,fees.commodity_sku,fees.asin,fees.source_run_id)
  = (main.biz_day,main.shop_id,main.commodity_sku,main.asin,main.source_run_id)
