-- Product Visualize: an overlay can be a solid color instead of a Media Asset.
-- Plain fabrics ("Deep Blue Linen") have no photo yet; a color fill still shows
-- the shopper the right product in the configurator silhouette.
--
-- Exactly one of media_asset_id / color is set. Fit places an image and means
-- nothing for a color, so a color row keeps fit null. Deleting the Asset still
-- removes an image mapping (on delete cascade); a color row has no Asset to lose.

alter table item_overlay_mappings alter column media_asset_id drop not null;
alter table item_overlay_mappings add column if not exists color text;

alter table item_overlay_mappings drop constraint if exists item_overlay_mappings_color_check;
alter table item_overlay_mappings
  add constraint item_overlay_mappings_color_check check (color is null or color ~ '^#[0-9a-f]{6}$');

alter table item_overlay_mappings drop constraint if exists item_overlay_mappings_image_or_color_check;
alter table item_overlay_mappings
  add constraint item_overlay_mappings_image_or_color_check
  check ((media_asset_id is null) <> (color is null));

alter table item_overlay_mappings drop constraint if exists item_overlay_mappings_color_fit_check;
alter table item_overlay_mappings
  add constraint item_overlay_mappings_color_fit_check check (color is null or fit is null);
