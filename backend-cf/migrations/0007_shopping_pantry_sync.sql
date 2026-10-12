-- Flag to prevent double-adding shopping qty into pantry on repeated check PUTs.
ALTER TABLE shopping_list_items
  ADD COLUMN has_been_added_to_pantry INTEGER NOT NULL DEFAULT 0;
