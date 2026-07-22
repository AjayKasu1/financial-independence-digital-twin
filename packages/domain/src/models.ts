export type IsoDate = string;

export type FactCategory =
  | "CLIENT_FACT"
  | "DETERMINISTIC_CALCULATION"
  | "EXTERNAL_FACT"
  | "PLANNING_ASSUMPTION"
  | "ADVISOR_JUDGMENT"
  | "AI_SUGGESTION";

export interface Provenance {
  readonly sourceId: string;
  readonly sourceType: "CLIENT_INPUT" | "DOCUMENT" | "SANDBOX" | "PUBLIC_API" | "SYSTEM";
  readonly observedAt: IsoDate;
  readonly recordedAt: IsoDate;
  readonly confidence: number;
  readonly location?: string;
  readonly supersededBy?: string;
}

export interface Person {
  readonly id: string;
  readonly firstName: string;
  readonly age: number;
  readonly retirementAge: number;
}

export interface Account {
  readonly id: string;
  readonly name: string;
  readonly type: "TAXABLE" | "RETIREMENT" | "CASH" | "EDUCATION";
  readonly balance: number;
  readonly managed: boolean;
  readonly provenance: Provenance;
}

export interface Holding {
  readonly id: string;
  readonly accountId: string;
  readonly ticker: string;
  readonly name: string;
  readonly assetClass: "US_EQUITY" | "INTL_EQUITY" | "BOND" | "CASH" | "EMPLOYER_STOCK";
  readonly marketValue: number;
  readonly costBasis: number;
  readonly provenance: Provenance;
}

export interface IncomeSource {
  readonly id: string;
  readonly ownerId: string;
  readonly label: string;
  readonly annualAmount: number;
  readonly growthRate: number;
  readonly endAge?: number;
  readonly provenance: Provenance;
}

export interface Liability {
  readonly id: string;
  readonly name: string;
  readonly type: "MORTGAGE" | "STUDENT_LOAN" | "AUTO" | "OTHER";
  readonly balance: number;
  readonly annualRate: number;
  readonly monthlyPayment: number;
  readonly remainingMonths: number;
  readonly provenance: Provenance;
}

export interface Property {
  readonly id: string;
  readonly label: string;
  readonly type: "PRIMARY" | "RENTAL";
  readonly marketValue: number;
  readonly mortgageBalance: number;
  readonly monthlyRent: number;
  readonly monthlyExpenses: number;
  readonly location: string;
  readonly provenance: Provenance;
}

export interface RsuGrant {
  readonly id: string;
  readonly ownerId: string;
  readonly ticker: string;
  readonly unvestedValue: number;
  readonly nextVestDate: IsoDate;
  readonly nextVestValue: number;
  readonly withholdingRate: number;
  readonly provenance: Provenance;
}

export interface Goal {
  readonly id: string;
  readonly type: "FINANCIAL_INDEPENDENCE" | "EDUCATION" | "HOME" | "LEGACY";
  readonly label: string;
  readonly targetAmount: number;
  readonly targetDate: IsoDate;
  readonly annualSpendingTarget?: number;
  readonly priority: number;
}

export interface HouseholdPreferences {
  readonly riskTolerance: "CONSERVATIVE" | "MODERATE" | "GROWTH";
  readonly liquidityFloor: number;
  readonly maxRealEstateHoursPerMonth: number;
  readonly realEstateInterest: "LOW" | "MEDIUM" | "HIGH";
  readonly values: readonly string[];
}

export interface ClientConstitution {
  readonly id: string;
  readonly householdId: string;
  readonly version: number;
  readonly effectiveAt: IsoDate;
  readonly approvedBy: string;
  readonly constraints: {
    readonly liquidityFloor: number;
    readonly maxEmployerStockPercent: number;
    readonly maxRealEstateHoursPerMonth: number;
    readonly targetFiAge: number;
    readonly minimumFiSuccessProbability: number;
  };
  readonly preferences: {
    readonly riskTolerance: HouseholdPreferences["riskTolerance"];
    readonly realEstateInterest: HouseholdPreferences["realEstateInterest"];
    readonly values: readonly string[];
  };
}

export interface DecisionContext {
  readonly decisionCapital: number;
  readonly constitution: ClientConstitution;
}

export interface HouseholdSnapshot {
  readonly id: string;
  readonly name: string;
  readonly asOf: IsoDate;
  readonly members: readonly Person[];
  readonly accounts: readonly Account[];
  readonly holdings: readonly Holding[];
  readonly incomeSources: readonly IncomeSource[];
  readonly liabilities: readonly Liability[];
  readonly properties: readonly Property[];
  readonly rsuGrants: readonly RsuGrant[];
  readonly goals: readonly Goal[];
  readonly preferences: HouseholdPreferences;
  readonly annualSpending: number;
}

export type FinancialEventType =
  | "RSU_VEST"
  | "CONCENTRATION_BREACH"
  | "STOCK_MOVE"
  | "RENTAL_VACANCY"
  | "BONUS"
  | "DATA_STALE"
  | "PLAN_DRIFT";

export interface FinancialEvent {
  readonly id: string;
  readonly householdId: string;
  readonly type: FinancialEventType;
  readonly title: string;
  readonly description: string;
  readonly severity: "LOW" | "MEDIUM" | "HIGH";
  readonly occurredAt: IsoDate;
  readonly status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
}

export interface AssumptionSet {
  readonly id: string;
  readonly version: number;
  readonly asOf: IsoDate;
  readonly inflationRate: number;
  readonly withdrawalRate: number;
  readonly equityReturnMean: number;
  readonly equityVolatility: number;
  readonly bondReturnMean: number;
  readonly bondVolatility: number;
  readonly cashReturn: number;
  readonly taxDrag: number;
  readonly planningHorizonYears: number;
  readonly simulationPaths: number;
  readonly seed: number;
}

export type StrategyType = "RENTAL" | "PORTFOLIO" | "DEBT_PAYDOWN" | "MIXED";

export interface RentalStrategyInput {
  readonly purchasePrice: number;
  readonly downPaymentPercent: number;
  readonly closingCostPercent: number;
  readonly mortgageRate: number;
  readonly mortgageTermYears: number;
  readonly monthlyRent: number;
  readonly vacancyRate: number;
  readonly managementRate: number;
  readonly annualPropertyTax: number;
  readonly annualInsurance: number;
  readonly annualMaintenanceRate: number;
  readonly annualCapexRate: number;
  readonly appreciationRate: number;
  readonly rentGrowthRate: number;
  readonly sellingCostPercent: number;
  readonly hoursPerMonth: number;
  readonly hourlyTimeValue: number;
}

export interface PortfolioStrategyInput {
  readonly initialInvestment: number;
  readonly annualContribution: number;
  readonly equityAllocation: number;
  readonly bondAllocation: number;
  readonly cashAllocation: number;
  readonly fundExpenseRate: number;
}

export interface DebtPaydownStrategyInput {
  readonly liabilityId: string;
  readonly lumpSum: number;
}

export interface MixedStrategyInput {
  readonly rentalAllocation: number;
  readonly portfolioAllocation: number;
  readonly debtAllocation: number;
}

export interface StrategyRequest {
  readonly type: StrategyType;
  readonly rental?: RentalStrategyInput;
  readonly portfolio?: PortfolioStrategyInput;
  readonly debt?: DebtPaydownStrategyInput;
  readonly mixed?: MixedStrategyInput;
}

export interface YearProjection {
  readonly year: number;
  readonly age: number;
  readonly liquidAssets: number;
  readonly propertyEquity: number;
  readonly liabilities: number;
  readonly netWorth: number;
  readonly fiTarget: number;
}

export interface ScenarioRisk {
  readonly code: string;
  readonly severity: "LOW" | "MEDIUM" | "HIGH";
  readonly message: string;
}

export interface ScenarioResult {
  readonly id: string;
  readonly strategy: StrategyType;
  readonly label: string;
  readonly fiNumber: number;
  readonly fiAge: number | null;
  readonly fiYear: number | null;
  readonly successProbability: number;
  readonly projectedNetWorth: number;
  readonly projectedLiquidAssets: number;
  readonly annualCashFlow: number;
  readonly firstYearAdvisoryFee: number;
  readonly cumulativeAdvisoryFees: number;
  readonly clientTimeCost: number;
  readonly investableAssetsChange: number;
  readonly capitalUse: {
    readonly available: number;
    readonly required: number;
    readonly deployed: number;
    readonly residual: number;
    readonly feasible: boolean;
    readonly affectedInputs: readonly string[];
  };
  readonly timeline: readonly YearProjection[];
  readonly risks: readonly ScenarioRisk[];
  readonly assumptions: AssumptionSet;
  readonly calculations: Readonly<Record<string, number | string | null>>;
}

export interface DecisionSensitivityCell {
  readonly mortgageRate: number;
  readonly monthlyRent: number;
  readonly annualCashFlow: number;
  readonly rentalSuccessProbability: number;
  readonly rentalLeads: boolean;
}

export interface DecisionAnalysis {
  readonly targetScenarioId: string;
  readonly targetScenarioLabel: string;
  readonly targetSuccessProbability: number;
  readonly rentalScenarioId: string;
  readonly rentalSuccessProbability: number;
  readonly rentalSnapshot: {
    readonly purchasePrice: number;
    readonly monthlyRent: number;
    readonly mortgageRate: number;
    readonly hoursPerMonth: number;
  };
  readonly breakEvenMortgageRate: number | null;
  readonly breakEvenMonthlyRent: number | null;
  readonly maxAffordablePurchasePrice: number;
  readonly sensitivity: readonly DecisionSensitivityCell[];
  readonly definition: string;
}

export interface FeeTier {
  readonly upTo: number | null;
  readonly annualRate: number;
}

export interface FeeSchedule {
  readonly tiers: readonly FeeTier[];
  readonly minimumAnnualFee: number;
  readonly method: "BLENDED" | "BREAKPOINT";
}

export interface ConflictFlag {
  readonly code: "ADVISOR_REVENUE_INCREASE" | "ADVISOR_REVENUE_DECREASE" | "ROLLOVER";
  readonly severity: "DISCLOSE" | "REVIEW";
  readonly message: string;
  readonly annualRevenueDifference: number;
}
