import HistoricalPriceInput from "Services/HistoricalPriceService/models/HistoricalPriceInput";
import PriceData from "./models/PriceData";
import HttpException from "@/utils/exceptions/HttpException";
import { mapCSVToPriceData } from "./utils/HistoricalPriceUtils";
import { FinancialDataListWrapper } from "./models/FinancialData";
import fetch, { Response } from "node-fetch";
import CONSTANTS from "../../Services/ServiceConstants";

class HistoricalPriceService {

    private historicalPriceUrlV1: string;
    private stockQuoteUrlV11: string;

    constructor() {
        this.historicalPriceUrlV1 = process.env.historical_data_source_url_v1 ?? CONSTANTS.GLOBAL.EMPTY;
        this.stockQuoteUrlV11 = process.env.stock_quote_source_url ?? CONSTANTS.GLOBAL.EMPTY;
    }

    public async getHistoricalPrices(input: HistoricalPriceInput): Promise<PriceData[]> {
        console.log(`In historical price service getting historical data for symbol: ${input.symbol}`);
        try {
            const url = `${this.historicalPriceUrlV1}/${input.symbol}` + 
                      `?symbol=${input.symbol}&period1=${input.fromDate}` + 
                      `&period2=${input.toDate}&interval=1d&includeAdjustedClose=true`;
            return fetch(url, { method: 'GET'})
                .catch((err: any) => {
                    console.log(`Error occurred getting historical data for ${input.symbol}: ${err.message}`);
                    throw new HttpException(err.status, `Error occurred while fetching historical prices: ${err.message}`);
                }).then(async (response: Response) => {
                    if (response.status != 200) {
                        throw new HttpException(response.status,
                        `Error occurred getting historical data: ${response.text()}`);
                    }
                    return response.text();
                }).then(async (body: string) => {
                    return mapCSVToPriceData(body);
                });
        } catch (err: any) {
            throw new HttpException(err.status, `Error occurred while fetching historical prices: ${err.message}`);
        }
    }

    public async getCurrentPrice(symbol: string): Promise<number> {
        console.log("In historical price service getting current price for symbol: " + symbol);
        try {
            const url = `${this.stockQuoteUrlV11}/${symbol}?modules=financialData`;
            return fetch(url)
                .then(async (response: Response) => {
                    if (response.status != 200) {
                        throw new HttpException(response.status,
                            "Error occurred while getting current price data: " + await response.text());
                    }
                    return response.json();
                }).then(async (body: FinancialDataListWrapper) => {
                    return body.quoteSummary.result[0].financialData.currentPrice.raw;
                });
        } catch (err: any) {
            throw new HttpException(err.status, 'Error occurred while getting current price data: ' + err.message);
        }
    }
}

export default HistoricalPriceService;