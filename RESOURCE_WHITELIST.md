# RP / 水晶庭 — Resource Whitelist

This file defines the only production resources that may be modified when operating inside the RP / 水晶庭 project.

## Allowed write targets

### GitHub
- Repository: `Lacrystalline/lacrystalline.github.io`
- Branch: `main`

### Supabase
- Project name: `Lacrystalline's Project`
- Project ID / ref: `idqysanzhafayovieqig`
- Organization ID: `ztxjgqhystyermqoopbi`
- Region: `ap-southeast-2`

## Guard rules

1. Default-deny all other GitHub repositories and Supabase projects.
2. Before every write operation, verify the exact repository full name or Supabase project ID.
3. Never select a target by display name, recency, or similarity.
4. If the requested target does not match this whitelist, do not write from the RP / 水晶庭 project.
5. A different venue/system must use a separate ChatGPT Project and its own whitelist.
6. Read-only inspection of other resources is also discouraged unless explicitly required for migration/verification.
7. Secrets, bearer tokens, service-role keys, Discord bot tokens, and private credentials must never be copied into this file.

## Purpose

Prevent accidental cross-project writes when multiple GitHub/Supabase accounts or projects are connected.
