-- Sender address and boxes live on the courier account (api_configs slug easyship); live rates are on per method.
alter table shipping_settings
  drop column easyship_enabled,
  drop column origin_address,
  drop column packages;
