import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { Database, DbDiscount, DbSimpleDiscount, TableName, TablesInsert } from './supabase-discount.typings';
import { Discount, SimpleDiscount } from '../ffs-discount/discount.typings';
import { PeriodicData } from '@/src/types';
import { StickerPriceInput } from '../../sticker-price/sticker-price.typings';
import { BenchmarkRatioPriceInput } from '../../benchmark/benchmark.typings';
import { DiscountedCashFlowInput } from '../../financial-modeling-prep/discounted-cash-flow/discounted-cash-flow.typings';
import DatabaseException from '@/utils/exceptions/DatabaseException';
import { SELECT_BULK_SIMPLE_DISCOUNTS_QUERY, SELECT_DISCOUNT_QUERY } from './supabase-discount.queries';
import { mapDbToDiscount, mapToSimpleDiscount } from './supabase-discount.utils';
import { IDiscountService } from '../discount-service.typings';
import CONSTANTS from '@/services/service.constants';

class SupabaseDiscountService implements IDiscountService {

    client: SupabaseClient<Database>;

    constructor(url: string, key: string) {
        this.client = createClient<Database>(
            url,
            key
        )
    }

    public async save(discount: Discount): Promise<string> {
        console.log(`Saving discount for ${discount.cik}...`);
        const currentDiscount = await this.fetchDiscountIfExists(discount.cik); 
        
        try {
            await this.upsertDiscount(discount);
        } catch (error: any) {
            console.log(`New discount upsert failed: ${error.message}`);
            if (currentDiscount) {
                console.log('Attempting to reset discount to original...');
                await this.upsertDiscount(currentDiscount);
            } else {
                console.log('Deleting inserted data...');
                await this.delete(discount.cik);
            }
        }

        return CONSTANTS.GLOBAL.SUCCESS;
    }

    public async delete(cik: string): Promise<string> {
        console.log(`Deleting discount for ${cik}`);
        await this.deleteData('discount', 'cik', cik);
        return CONSTANTS.GLOBAL.SUCCESS;
    }
    
    public async getBulkSimpleDiscounts(): Promise<SimpleDiscount[]> {
        const select_discount_query = this.client
            .from('discount')
            .select(SELECT_BULK_SIMPLE_DISCOUNTS_QUERY)
            .returns<DbSimpleDiscount[]>();

        const { data, error } = await select_discount_query;

        if (error) {
            throw new DatabaseException(error.message);
        }

        if (!data) {
            return [];
        }

        return mapToSimpleDiscount(data);
    }

    private async upsertDiscount(discount: Discount): Promise<void> {
        console.log('Upserting discount...');
        
        // Discount object
        await this.upsertData('discount', {
            cik: discount.cik,
            active: discount.active,
            last_updated: discount.lastUpdated.toDateString(),
            name: discount.name,
            symbol: discount.symbol
        });

        // Sticker price valuation
        const stickerPrice = discount.stickerPrice;
        await this.upsertData('sticker_price', {
            cik: stickerPrice.cik,
            price: stickerPrice.price
        });
        await this.upsertStickerPriceInput(discount.stickerPrice.input);

        // Benchmark ratio price valuation
        const benchmarkRatioPrice = discount.benchmarkRatioPrice;
        await this.upsertData('benchmark_ratio_price', {
            cik: benchmarkRatioPrice.cik,
            price: benchmarkRatioPrice.price
        });
        await this.upsertBenchmarkRatioPriceInput(discount.benchmarkRatioPrice.input);

        // Discounted cash flow price valuation
        const discountedCashFlowPrice = discount.discountedCashFlowPrice;
        await this.upsertData('discounted_cash_flow_price', {
            cik: discountedCashFlowPrice.cik,
            price: discountedCashFlowPrice.price
        });
        await this.upsertDiscountedCashFlowPriceInput(discount.discountedCashFlowPrice.input);
    }

    private async upsertStickerPriceInput(input: StickerPriceInput): Promise<void> {
        await this.upsertData('sticker_price_input', {
            cik: input.cik,
            debt_years: input.debtYears
        });
        await this.upsertPeriodicData('annual_bvps', input.annualBVPS);
        await this.upsertPeriodicData('annual_pe', input.annualPE);
        await this.upsertPeriodicData('annual_roic', input.annualROIC);
        await this.upsertPeriodicData('annual_eps', input.annualEPS);
        await this.upsertPeriodicData('annual_equity', input.annualEquity);
        await this.upsertPeriodicData('annual_revenue', input.annualRevenue);
        await this.upsertPeriodicData('annual_operating_cash_flow', input.annualOperatingCashFlow);
    }

    private async upsertBenchmarkRatioPriceInput(input: BenchmarkRatioPriceInput): Promise<void> {
        await this.upsertData('benchmark_ratio_price_input', {
            cik: input.cik,
            industry: input.industry,
            ps_benchmark_ratio: input.psBenchmarkRatio,
            shares_outstanding: input.sharesOutstanding,
            ttm_revenue: input.ttmRevenue
        });
    }

    private async upsertDiscountedCashFlowPriceInput(input: DiscountedCashFlowInput): Promise<void> {
        await this.upsertData('discounted_cash_flow_input', {
            cik: input.cik,
            symbol: input.symbol,
            long_term_growth_rate: input.longTermGrowthRate,
            free_cash_flowt1: input.freeCashFlowT1,
            wacc: input.wacc,
            terminal_value: input.terminalValue,
            enterprise_value: input.enterpriseValue,
            net_debt: input.netDebt,
            diluted_shares_outstanding: input.dilutedSharesOutstanding,
            market_price: input.marketPrice
        })
        await this.upsertPeriodicData('historical_operating_cash_flow', input.historicalOperatingCashFlow);
        await this.upsertPeriodicData('projected_operating_cash_flow', input.projectedOperatingCashFlow);
        await this.upsertPeriodicData('historical_capital_expenditure', input.historicalCapitalExpenditure);
        await this.upsertPeriodicData('projected_capital_expenditure', input.projectedCapitalExpenditure);
        await this.upsertPeriodicData('historical_free_cash_flow', input.historicalFreeCashFlow);
        await this.upsertPeriodicData('projected_free_cash_flow', input.projectedFreeCashFlow);
    }

    private async upsertPeriodicData(name: TableName, periodicDataList: PeriodicData[]): Promise<void> {
        if (periodicDataList.length !== 0) {
            const cik = periodicDataList[0].cik;
            await this.deleteData(name, 'cik', cik);
            for (let periodicData of periodicDataList) {
                await this.upsertData(name, {
                    cik: periodicData.cik,
                    announced_date: new Date(periodicData.announcedDate).toISOString(),
                    value: periodicData.value,
                    period: periodicData.period
                });
            }
        }
    }

    private async upsertData(name: TableName, tableData: TablesInsert<typeof name>): Promise<void> {
        const { error } = await this.client
            .from(name)
            .upsert(tableData);

        if (error) {
            throw new DatabaseException(error.message);
        }
    }
    
    private async deleteData(name: TableName, columnName: string, value: string): Promise<void> {
        const { error } = await this.client
            .from(name)
            .delete()
            .eq(columnName, value);

        if (error) {
            throw new DatabaseException(error.message);
        }
    }

    private async fetchDiscountIfExists(cik: string): Promise<Discount | null> {
        const select_discount_query = this.client
            .from('discount')
            .select(SELECT_DISCOUNT_QUERY)
            .eq('cik', cik)
            .returns<DbDiscount>()
            .maybeSingle();

        const { data, error } = await select_discount_query;

        if (error) {
            throw new DatabaseException(error.message);
        }

        if (!data) {
            return null;
        }

        return mapDbToDiscount(data as DbDiscount);
    }

}

export default SupabaseDiscountService;