# Amazon Ads CLI

A command-line interface for the Amazon Ads API. Manage campaigns, keywords, and product ads directly from your terminal.

## Installation

```bash
git clone https://github.com/cprice70/amazonads-cli.git
cd amazonads-cli
npm install
npm run build
npm link
```

## Authentication

```bash
amazonads auth login
```

This will prompt for your Amazon Ads API Client ID and Client Secret, open a browser to complete OAuth, and save credentials to `~/.config/amazonads-cli/config.json`.

You can also create the config file manually:

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
| `sandbox` | `true` / `false` | Use test API endpoint |
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

Lists all advertising profiles on your account. Run this first to get profile IDs.

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
# Check status of / download a report by ID
amazonads reports get --profile <id> --report <report-id>
amazonads reports get --profile <id> --report <report-id> --json
```

Use this to retrieve a pending report returned by `campaigns performance`.

## Output

All commands support `--json` to output raw API responses instead of a formatted table.

## Development

```bash
npm run build       # Compile TypeScript
npm run test        # Run tests
npm run watch       # Watch mode
```

Requires Node.js 18+.
