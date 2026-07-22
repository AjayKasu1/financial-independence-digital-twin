import type {
  AssumptionSet,
  FeeSchedule,
  FinancialEvent,
  HouseholdSnapshot,
  StrategyRequest
} from "./models";

const asOf = "2026-07-22";
const provenance = {
  sourceId: "synthetic-demo-onboarding",
  sourceType: "SANDBOX" as const,
  observedAt: asOf,
  recordedAt: `${asOf}T13:00:00.000Z`,
  confidence: 1,
  location: "Synthetic demo seed"
};

export const demoHousehold: HouseholdSnapshot = {
  id: "household-patel-demo",
  name: "Maya & Arjun Patel",
  asOf,
  members: [
    { id: "person-maya", firstName: "Maya", age: 37, retirementAge: 52 },
    { id: "person-arjun", firstName: "Arjun", age: 39, retirementAge: 54 }
  ],
  accounts: [
    {
      id: "account-joint-taxable",
      name: "Joint taxable portfolio",
      type: "TAXABLE",
      balance: 485_000,
      managed: true,
      provenance
    },
    {
      id: "account-maya-401k",
      name: "Maya 401(k)",
      type: "RETIREMENT",
      balance: 356_000,
      managed: true,
      provenance
    },
    {
      id: "account-arjun-401k",
      name: "Arjun 401(k)",
      type: "RETIREMENT",
      balance: 308_000,
      managed: false,
      provenance
    },
    {
      id: "account-cash",
      name: "High-yield cash reserve",
      type: "CASH",
      balance: 182_000,
      managed: false,
      provenance
    }
  ],
  holdings: [
    {
      id: "holding-employer",
      accountId: "account-joint-taxable",
      ticker: "ACME",
      name: "Synthetic employer stock",
      assetClass: "EMPLOYER_STOCK",
      marketValue: 292_000,
      costBasis: 126_000,
      provenance
    },
    {
      id: "holding-us",
      accountId: "account-joint-taxable",
      ticker: "US-MKT",
      name: "Synthetic total US market fund",
      assetClass: "US_EQUITY",
      marketValue: 568_000,
      costBasis: 421_000,
      provenance
    },
    {
      id: "holding-intl",
      accountId: "account-maya-401k",
      ticker: "INTL-MKT",
      name: "Synthetic international fund",
      assetClass: "INTL_EQUITY",
      marketValue: 216_000,
      costBasis: 194_000,
      provenance
    },
    {
      id: "holding-bonds",
      accountId: "account-arjun-401k",
      ticker: "BOND-MKT",
      name: "Synthetic bond fund",
      assetClass: "BOND",
      marketValue: 255_000,
      costBasis: 248_000,
      provenance
    }
  ],
  incomeSources: [
    {
      id: "income-maya",
      ownerId: "person-maya",
      label: "Maya base compensation",
      annualAmount: 238_000,
      growthRate: 0.03,
      endAge: 52,
      provenance
    },
    {
      id: "income-arjun",
      ownerId: "person-arjun",
      label: "Arjun base compensation",
      annualAmount: 196_000,
      growthRate: 0.03,
      endAge: 54,
      provenance
    }
  ],
  liabilities: [
    {
      id: "liability-mortgage",
      name: "Primary residence mortgage",
      type: "MORTGAGE",
      balance: 548_000,
      annualRate: 0.03125,
      monthlyPayment: 3_240,
      remainingMonths: 238,
      provenance
    },
    {
      id: "liability-student",
      name: "Graduate student loan",
      type: "STUDENT_LOAN",
      balance: 42_000,
      annualRate: 0.062,
      monthlyPayment: 690,
      remainingMonths: 72,
      provenance
    }
  ],
  properties: [
    {
      id: "property-primary",
      label: "Primary residence",
      type: "PRIMARY",
      marketValue: 1_080_000,
      mortgageBalance: 548_000,
      monthlyRent: 0,
      monthlyExpenses: 1_850,
      location: "Raleigh-Durham, NC (synthetic)",
      provenance
    }
  ],
  rsuGrants: [
    {
      id: "rsu-maya-2026",
      ownerId: "person-maya",
      ticker: "ACME",
      unvestedValue: 284_000,
      nextVestDate: "2026-09-15",
      nextVestValue: 71_000,
      withholdingRate: 0.35,
      provenance
    }
  ],
  goals: [
    {
      id: "goal-fi",
      type: "FINANCIAL_INDEPENDENCE",
      label: "Work-optional by Maya age 52",
      targetAmount: 3_500_000,
      targetDate: "2041-12-31",
      annualSpendingTarget: 132_000,
      priority: 1
    },
    {
      id: "goal-education",
      type: "EDUCATION",
      label: "Fund two college plans",
      targetAmount: 320_000,
      targetDate: "2038-08-01",
      priority: 2
    }
  ],
  preferences: {
    riskTolerance: "GROWTH",
    liquidityFloor: 150_000,
    maxRealEstateHoursPerMonth: 8,
    realEstateInterest: "MEDIUM",
    values: ["Flexibility", "Family time", "Tax-aware diversification"]
  },
  annualSpending: 144_000
};

export const demoAssumptions: AssumptionSet = {
  id: "assumptions-base-2026",
  version: 1,
  asOf,
  inflationRate: 0.025,
  withdrawalRate: 0.04,
  equityReturnMean: 0.07,
  equityVolatility: 0.17,
  bondReturnMean: 0.038,
  bondVolatility: 0.06,
  cashReturn: 0.03,
  taxDrag: 0.006,
  planningHorizonYears: 30,
  simulationPaths: 1_000,
  seed: 20_260_722
};

export const demoFeeSchedule: FeeSchedule = {
  method: "BLENDED",
  minimumAnnualFee: 4_500,
  tiers: [
    { upTo: 1_000_000, annualRate: 0.009 },
    { upTo: 2_000_000, annualRate: 0.007 },
    { upTo: null, annualRate: 0.005 }
  ]
};

export const demoStrategies: readonly StrategyRequest[] = [
  {
    type: "RENTAL",
    rental: {
      purchasePrice: 525_000,
      downPaymentPercent: 0.25,
      closingCostPercent: 0.03,
      mortgageRate: 0.0675,
      mortgageTermYears: 30,
      monthlyRent: 3_650,
      vacancyRate: 0.06,
      managementRate: 0.08,
      annualPropertyTax: 6_825,
      annualInsurance: 2_200,
      annualMaintenanceRate: 0.01,
      annualCapexRate: 0.0075,
      appreciationRate: 0.03,
      rentGrowthRate: 0.025,
      sellingCostPercent: 0.06,
      hoursPerMonth: 6,
      hourlyTimeValue: 90
    }
  },
  {
    type: "PORTFOLIO",
    portfolio: {
      initialInvestment: 147_000,
      annualContribution: 0,
      equityAllocation: 0.75,
      bondAllocation: 0.2,
      cashAllocation: 0.05,
      fundExpenseRate: 0.0012
    }
  },
  {
    type: "DEBT_PAYDOWN",
    debt: { liabilityId: "liability-student", lumpSum: 42_000 }
  }
];

export const demoEvents: readonly FinancialEvent[] = [
  {
    id: "event-rsu-vest",
    householdId: demoHousehold.id,
    type: "RSU_VEST",
    title: "$71K synthetic RSU vest approaching",
    description:
      "Evaluate withholding, sale, diversification, and goal-funding choices before September 15.",
    severity: "HIGH",
    occurredAt: "2026-07-22T13:05:00.000Z",
    status: "OPEN"
  },
  {
    id: "event-concentration",
    householdId: demoHousehold.id,
    type: "CONCENTRATION_BREACH",
    title: "Employer-stock exposure exceeds policy threshold",
    description: "Tracked employer stock is above the 25% review threshold for modeled holdings.",
    severity: "HIGH",
    occurredAt: "2026-07-22T13:06:00.000Z",
    status: "OPEN"
  },
  {
    id: "event-plan-drift",
    householdId: demoHousehold.id,
    type: "PLAN_DRIFT",
    title: "Rental decision needs an apples-to-apples review",
    description:
      "Compare cash flow, liquidity, time cost, concentration, and advisor compensation.",
    severity: "MEDIUM",
    occurredAt: "2026-07-22T13:07:00.000Z",
    status: "OPEN"
  }
];
