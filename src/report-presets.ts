import type { ReportSpec } from "./amazon-ads-client.js";

export type ReportPresetName = "search-term" | "targeting" | "campaign";

export const REPORT_PRESET_NAMES: ReportPresetName[] = ["search-term", "targeting", "campaign"];

// Columns shared by every Sponsored Products report preset. 7-day attribution
// matches the console's downloadable reports.
const CAMPAIGN_COLUMNS = [
  "portfolioId",
  "campaignName",
  "campaignId",
  "campaignStatus",
  "campaignBudgetAmount",
];

const METRIC_COLUMNS = [
  "impressions",
  "clicks",
  "clickThroughRate",
  "costPerClick",
  "cost",
  "sales7d",
  "purchases7d",
  "unitsSoldClicks7d",
  "attributedSalesSameSku7d",
  "unitsSoldSameSku7d",
];

const TARGET_COLUMNS = [
  "adGroupName",
  "adGroupId",
  "keywordId",
  "keyword",
  "keywordType",
  "matchType",
  "targeting",
];

interface PresetDefinition {
  reportTypeId: string;
  groupBy: string[];
  columns: string[];
}

const PRESETS: Record<ReportPresetName, PresetDefinition> = {
  "search-term": {
    reportTypeId: "spSearchTerm",
    groupBy: ["searchTerm"],
    columns: [
      ...CAMPAIGN_COLUMNS,
      ...TARGET_COLUMNS,
      "searchTerm",
      ...METRIC_COLUMNS,
      "salesOtherSku7d",
      "unitsSoldOtherSku7d",
    ],
  },
  targeting: {
    reportTypeId: "spTargeting",
    groupBy: ["targeting"],
    columns: [
      ...CAMPAIGN_COLUMNS,
      ...TARGET_COLUMNS,
      "keywordBid",
      "adKeywordStatus",
      ...METRIC_COLUMNS,
      "salesOtherSku7d",
      "unitsSoldOtherSku7d",
      "topOfSearchImpressionShare",
    ],
  },
  campaign: {
    reportTypeId: "spCampaigns",
    groupBy: ["campaign"],
    // spCampaigns does not accept portfolioId; join on campaignId via `campaigns list` instead.
    columns: [
      ...CAMPAIGN_COLUMNS.filter((c) => c !== "portfolioId"),
      "campaignBudgetType",
      "campaignBiddingStrategy",
      ...METRIC_COLUMNS,
      "topOfSearchImpressionShare",
    ],
  },
};

export function isReportPresetName(value: string): value is ReportPresetName {
  return (REPORT_PRESET_NAMES as string[]).includes(value);
}

export function buildReportSpec(
  preset: ReportPresetName,
  startDate: string,
  endDate: string,
  daily: boolean
): ReportSpec {
  const def = PRESETS[preset];
  const timeUnit = daily ? "DAILY" : "SUMMARY";
  // The API requires `date` for DAILY reports and `startDate`/`endDate` for SUMMARY.
  const dateColumns = daily ? ["date"] : ["startDate", "endDate"];

  return {
    name: `${preset} ${startDate} to ${endDate}`,
    startDate,
    endDate,
    reportTypeId: def.reportTypeId,
    groupBy: def.groupBy,
    columns: [...dateColumns, ...def.columns],
    timeUnit,
  };
}
