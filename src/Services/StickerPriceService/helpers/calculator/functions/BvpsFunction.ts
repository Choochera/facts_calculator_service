import QuarterlyData from "@/resources/discount/models/QuarterlyData";
import AbstractRetriever from "../../retriever/AbstractRetriever";
import RetrieverFactory from "../../retriever/retrieverUtils/RetrieverFactory";
import AbstractFunction from "./AbstractFunction";
import { days_between, median_date, quarterize } from "../../../../../Services/StickerPriceService/utils/StickerPriceUtils";

class BvpsFunction extends AbstractFunction {

    private cik: string;
    private quarterly_shareholder_equity: QuarterlyData[];
    private quarterly_outstanding_shares: QuarterlyData[];
    
    constructor(cik: string, retriever: AbstractRetriever) {
        super(retriever);
        this.quarterly_outstanding_shares = [];
        this.quarterly_shareholder_equity = [];
        this.cik = cik;
    }

    calculate(): QuarterlyData[] {
        const quarterly_BVPS: QuarterlyData[] = [];
        let equityIndex = 0;
        let outstandingIndex = 0;
        while (equityIndex < this.quarterly_shareholder_equity.length &&
            outstandingIndex < this.quarterly_outstanding_shares.length) {
                let equityDate = this.quarterly_shareholder_equity[equityIndex].announcedDate;
                let outstandingDate = this.quarterly_outstanding_shares[outstandingIndex].announcedDate;
                while (outstandingDate.getTime() <= equityDate.getTime() && outstandingIndex + 1 !== this.quarterly_outstanding_shares.length) {
                    quarterly_BVPS.push({
                        cik: this.cik,
                        announcedDate: median_date(equityDate, outstandingDate),
                        value: this.quarterly_shareholder_equity[equityIndex].value /
                            this.quarterly_outstanding_shares[outstandingIndex].value
                    });
                    outstandingIndex++;
                    outstandingDate = this.quarterly_outstanding_shares[outstandingIndex].announcedDate;
                }
                while (equityDate.getTime() <= outstandingDate.getTime() && equityIndex + 1 !== this.quarterly_shareholder_equity.length) {
                    quarterly_BVPS.push({
                        cik: this.cik,
                        announcedDate: median_date(equityDate, outstandingDate),
                        value: this.quarterly_shareholder_equity[equityIndex].value /
                            this.quarterly_outstanding_shares[outstandingIndex].value
                    });
                    equityIndex++;
                    equityDate = this.quarterly_shareholder_equity[equityIndex].announcedDate;
                }
                if (equityIndex + 1 === this.quarterly_shareholder_equity.length && outstandingIndex + 1 === this.quarterly_outstanding_shares.length) {
                    quarterly_BVPS.push({
                        cik: this.cik,
                        announcedDate: median_date(equityDate, outstandingDate),
                        value: this.quarterly_shareholder_equity[equityIndex].value /
                            this.quarterly_outstanding_shares[outstandingIndex].value
                    });
                    equityIndex++;
                    outstandingIndex++;
                }
            }
        return quarterly_BVPS;
    }

    async setVariables(): Promise<void> {
        return Promise.all([
            this.retriever.retrieve_quarterly_shareholder_equity(),
            this.retriever.retrieve_quarterly_outstanding_shares()])
        .then((data: [QuarterlyData[], QuarterlyData[]]) => {
            this.quarterly_shareholder_equity = data[0];
            this.quarterly_outstanding_shares = data[1];
        });
    }

    annualize(quarterlyBVPS: QuarterlyData[]): QuarterlyData[] {
        let index = quarterlyBVPS.length - 1;
        const annualBVPS: QuarterlyData[] = [];
        while (index >= 0) {
            let sum = quarterlyBVPS[index].value;
            let count = 1;
            let periodStartDate: Date = quarterlyBVPS[index].announcedDate;
            index--;
            while (index >= 0 && days_between(periodStartDate, quarterlyBVPS[index].announcedDate) <= 365) {
                sum += quarterlyBVPS[index].value;
                count++;
                index--;
            }
            annualBVPS.splice(0, 0, {
                cik: this.cik,
                announcedDate: periodStartDate,
                value: sum/count
            });
        }
        return annualBVPS;
    }

    getLastQuarterAndAnnualizedData(quartertlyBVPS: QuarterlyData[]): { lastQuarters: number[]; annualBVPS: QuarterlyData[]; } {
        return {
            lastQuarters: this.getLastQuarterData(quartertlyBVPS),
            annualBVPS: this.annualize(quartertlyBVPS)
        }
    }

    private getLastQuarterData(quarterlyBVPS: QuarterlyData[]): number[] {
        let lastQuarters: number[] = [];
        let index = quarterlyBVPS.length - 1;
        let periodStartDate: Date = quarterlyBVPS[index].announcedDate;
        index--;
        while (index >= 0 && days_between(periodStartDate, quarterlyBVPS[index].announcedDate) <= 365) {
            index--;
        }
        for (let i = index + 1; i < quarterlyBVPS.length; i++) {
            lastQuarters.push(quarterlyBVPS[i].value);
        }
        lastQuarters = quarterize(lastQuarters);
        return lastQuarters;
    }
    
}

export default BvpsFunction;