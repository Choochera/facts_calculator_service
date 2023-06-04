import PriceData from "../../../HistoricalPriceService/models/PriceData";
import AbstractFunction from "./functions/AbstractFunction";
import BvpsFunction from "./functions/BvpsFunction";
import QuarterlyData from "@/resources/discount/models/QuarterlyData";
import Discount from "@/resources/discount/IDiscount";
import Identity from "@/resources/identity/models/Identity";
import PeFunction from "./functions/PeFunction";
import RetrieverFactory from "../retriever/retrieverUtils/RetrieverFactory";
import AbstractRetriever from "../retriever/AbstractRetriever";
import InsufficientDataException from "../../../../exceptions/InsufficientDataException";

class Calculator {

    private identity: Identity;
    private facts: any;
    private calcFunction: AbstractFunction;

    constructor(identity: Identity, facts: any) {
        this.identity = identity;
        this.facts = facts;
        this.calcFunction = new BvpsFunction(this.identity.cik, this.facts);
    }

    public async calculateStickerPriceData(): Promise<Discount | null> {
        return Promise.all([
            this.calculateQuarterlyBVPS(),
            this.fetchQuarterlyEPS()])
        .then((data: QuarterlyData[][]) => {
            const [ quarterlyBVPS, quarterlyEPS ] = data;
            const { tyy_BVPS_growth, tfy_BVPS_growth, tty_BVPS_growth } = this.calculateGrowthRates(data[0]);
            return {
                cik: this.identity.cik,
                symbol: this.identity.symbol,
                name: this.identity.name,
                ratioPrice: 0,
                lastUpdated: new Date(),
                ttmPriceData: [],
                tfyPriceData: [],
                ttyPriceData: [],
                quarterlyBVPS: quarterlyBVPS,
                quarterlyPE: [],
                quarterlyEPS: quarterlyEPS,
                quarterlyROIC: [],
            }
        });
    }

    private async fetchQuarterlyEPS(): Promise<QuarterlyData[]> {
        const retrieverFactory: RetrieverFactory = new RetrieverFactory();
        const retriever: AbstractRetriever = retrieverFactory.getRetriever(this.identity.cik, this.facts);
        return retriever.retrieve_quarterly_EPS();
    }

    private async calculateQuarterlyBVPS(): Promise<QuarterlyData[]> {
        return this.calcFunction.setVariables().then(() => {
            return this.calcFunction.calculate();
        });
    }

    private async calculateQuarterlyPE(): Promise<QuarterlyData[]> {
        this.calcFunction = new PeFunction();
        return [];
    }

    private calculateGrowthRates(quarterlyBVPS: QuarterlyData[]): { tyy_BVPS_growth: number, tfy_BVPS_growth: number, tty_BVPS_growth: number } {
        try {
            const { lastQuarters, annualBVPS } = this.calcFunction.annualize(quarterlyBVPS);
            const tyy_BVPS_growth = (Math.pow(lastQuarters[lastQuarters.length - 1] / lastQuarters[0], (1/1)) - 1) * 100;
            const tfy_BVPS_growth = (Math.pow(annualBVPS[annualBVPS.length - 1].value / annualBVPS[annualBVPS.length - 5].value, (1/5)) - 1) * 100;
            const tty_BVPS_growth = (Math.pow(annualBVPS[annualBVPS.length - 1].value / annualBVPS[annualBVPS.length - 10].value, (1/10)) - 1) * 100;
            return { tyy_BVPS_growth, tfy_BVPS_growth, tty_BVPS_growth }
        } catch (error: any) {
            throw new InsufficientDataException(`Insufficient data collected to calcuate growth rates for ${this.identity.name}`);
        }
    }

}

export default Calculator;