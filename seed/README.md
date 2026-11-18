# Seed project

Copy the local development settings from `.env.example` into `../backend/.env`, then fill in the object storage bucket and credentials. The MongoDB, Redis, and Elasticsearch values are for the services in `compose.yaml`.

Run the full database seed from this directory with:

```sh
SEED_ALLOW_RESET=true bun run seed
```

This drops and recreates the configured database. The seed uploads the three WebP placeholders to object storage before seeding products. `bun run seed:categories` seeds only the category collection.

The admin Settlements page is seeded with three useful seller account states: vendor 1 has a negative balance from a refund after a simulated payout, vendor 2 has pending earnings, and vendor 3 has a failed settlement that can be settled through the account flow. The remaining sellers have completed simulated settlements. Seed transfer references use the `SIM-SEED-` prefix; none represent real bank transfers.
