# Amazon Ads CLI

[![CI](https://github.com/cprice70/amazonads-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/cprice70/amazonads-cli/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/amazonads-cli.svg)](https://www.npmjs.com/package/amazonads-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A command-line interface for the **Amazon Ads API**. Unlike bulk-sheet tools that work on exported CSV files, this CLI makes **live API calls** — query your account, create campaigns, update bids, and pull reports in real time without touching the Amazon Ads console.

## Prerequisites

You need an approved Amazon Ads API application to use this tool.

1. Sign in at [advertising.amazon.com](https://advertising.amazon.com) and navigate to **Tools → API access**
2. Request API access and create an application to obtain a Client ID and Client Secret
3. See [Amazon's API onboarding guide](https://advertising.amazon.com/API/docs/en-us/onboarding/overview) for full details

## Installation

```bash
git clone https://github.com/cprice70/amazonads-cli.git
cd amazonads-cli
npm install
npm run build
npm link
```

Or install from npm (once published):

```bash
npm install -g amazonads-cli
```

## Authentication

```bash
amazonads auth login
```

Prompts for your Client ID and Client Secret, opens a browser to complete Amazon OAuth, and saves credentials to `~/.config/amazonads-cli/config.json`.

You can also create the config file manually if you already have a refresh token:

```json
{
  "clientId": "amzn1.application-oa2-client.xxxxxxxxxxxx",
  "clientSecret": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "refreshToken": "Atzr|xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "region": "NA",
  "sandbox": false,
  "defaultProfileId": "1234567890"
}
```

| Field | Values | Notes |
|---|---|---|
| `clientId` | `amzn1.application-oa2-client.xxx` | From Amazon Ads API console |
| `clientSecret` | string | From Amazon Ads API console |
| `refreshToken` | `Atzr\|xxx` | Obtained via `auth login` or existing token |
| `region` | `NA`, `EU`, `FE` | North America, Europe, Far East |
| `sandbox` | `true` / `false` | Use the Amazon Ads test endpoint |
| `defaultProfileId` | numeric string | Avoids needing `--profile` on every command |

Environment variables override the config file: `AMAZON_ADS_CLIENT_ID`, `AMAZON_ADS_CLIENT_SECRET`, `AMAZON_ADS_REFRESH_TOKEN`, `AMAZON_ADS_REGION`, `AMAZON_ADS_SANDBOX`, `AMAZON_ADS_PROFILE_ID`.

## Commands

### Auth

```bash
amazonads auth login      # OAuth login, saves credentials
amazonads auth status     # Show current config (masked)
amazonads auth logout     # Delete config file
```

### Profiles

```bash
amazonads profiles
amazonads profiles --json
```

Lists all advertising profiles on your account. Run this first to find your profile IDs — you'll need one for most other commands.

### Campaigns

```bash
# List campaigns
amazonads campaigns list --profile <id>
amazonads campaigns list --profile <id> --state enabled
amazonads campaigns list --profile <id> --type sponsoredBrands
amazonads campaigns list --profile <id> --json

# Campaign performance report (async — may return a report ID if still processing)
amazonads campaigns performance --profile <id> --campaign <id> --start 2024-01-01 --end 2024-01-31

# Create a campaign (always created in PAUSED state)
amazonads campaigns create \
  --profile <id> \
  --name "My Campaign" \
  --type sponsoredProducts \
  --targeting MANUAL \
  --budget 10.00 \
  --start 2024-07-01

# Archive a campaign
amazonads campaigns archive --profile <id> --campaign <id> --type sponsoredProducts
amazonads campaigns archive --profile <id> --campaign <id> --type sponsoredProducts --confirm
```

**Campaign types:** `sponsoredProducts`, `sponsoredBrands`, `sponsoredDisplay`

### Keywords

```bash
# List keywords
amazonads keywords list --profile <id>
amazonads keywords list --profile <id> --campaign <campaign-id>
amazonads keywords list --profile <id> --campaign <campaign-id> --ad-group <ad-group-id>

# Update keyword bid
amazonads keywords update-bid --profile <id> --keyword <keyword-id> --bid 1.25
```

### Product Ads

```bash
amazonads product-ads list --profile <id>
amazonads product-ads list --profile <id> --campaign <campaign-id>
amazonads product-ads list --profile <id> --campaign <campaign-id> --ad-group <ad-group-id>
```

### Reports

```bash
# Create a Sponsored Products report and wait for it (7-day attribution columns)
amazonads reports create --type search-term --start 2026-09-11 --end 2026-10-10 --out search_term.csv
amazonads reports create --type targeting   --start 2026-09-11 --end 2026-10-10 --daily --out targeting.csv
amazonads reports create --type campaign    --start 2026-09-11 --end 2026-10-10 --out campaign.json

# Request without waiting, then fetch later
amazonads reports create --type search-term --start 2026-09-11 --end 2026-10-10 --no-wait
amazonads reports get --profile <id> --report <report-id> --out search_term.csv
amazonads reports get --profile <id> --report <report-id> --json
```

**Report types:** `search-term` (spSearchTerm), `targeting` (spTargeting), `campaign` (spCampaigns).
`--daily` returns one row per day with a `date` column; the default is one summary row per entity.
`--out` writes CSV, or JSON when the file name ends in `.json`. `--timeout <seconds>` caps the wait (default 600).
The campaign report cannot include `portfolioId`; join on `campaignId` against `campaigns list` instead.

### Portfolios

```bash
amazonads portfolios list --profile <id>
amazonads portfolios list --profile <id> --json
```

## Output

All commands support `--json` to output raw API responses instead of a formatted table, making it easy to pipe results into `jq` or other tools.

## Development

```bash
npm run dev         # Run without building (hot-reloads on save)
npm run build       # Compile TypeScript
npm run watch       # Watch mode (compile only)
npm run test        # Run tests
```

Pass CLI arguments after `--` when using `dev`:

```bash
npm run dev -- campaigns list --profile 1234567890
```

Requires Node.js 18+.

## Releasing

Releases publish to npm from GitHub Actions using [npm trusted publishing](https://docs.npmjs.com/trusted-publishers) (OIDC). No npm token is stored in the repository.

```bash
npm version 2.1.0 --no-git-tag-version   # bump package.json and package-lock.json
git commit -am "Bump version to 2.1.0"
git push
git tag v2.1.0 && git push origin v2.1.0  # the tag push triggers .github/workflows/release.yml
```

The trusted publisher on npmjs.com must point at this repository (`cprice70/amazonads-cli`) and the workflow file name `release.yml`.

## License

MIT
