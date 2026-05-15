-- +goose Up
ALTER TABLE tournaments ADD CONSTRAINT tournaments_name_key UNIQUE (name);

-- +goose Down
ALTER TABLE tournaments DROP CONSTRAINT tournaments_name_key;
