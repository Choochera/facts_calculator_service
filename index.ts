import 'module-alias/register';
import bootstrap from './src/bootstrap';
import { SQSEvent, SQSRecord } from 'aws-lambda';
import DiscountManager from '@/resources/discount-manager/discount-manager';
import { removeS3KeySuffix, sleep } from '@/resources/resource.utils';
import { SqsMsgBody } from './src/types';
import CONSTANTS from '@/resources/resource.contants';

let manager: DiscountManager;
let frequency: number;

export const handler = async (event: SQSEvent): Promise<void> => {
    console.log(`Recieved event: ${JSON.stringify(event)}`);
    bootstrap();
    manager = new DiscountManager();
    frequency = +(process.env.price_check_consumer_frequency ?? 1);

    for(let record of event.Records) {
        try {
            const message: SqsMsgBody = JSON.parse(record.body);
            processSqsEvent(message);
        } catch (err: any) {
            processTestEvent(record);
        }
        await sleep(1000 * frequency);
    };

    console.log('Processing complete!');
};

async function processSqsEvent(event: SqsMsgBody): Promise<void> {
    for (let record of event.Records) {
        if (record.s3 && record.s3.object && record.s3.object.key) {
            const cik = removeS3KeySuffix(record.s3.object.key);
            console.log(`In price check consumer, processing: ${cik}`);
            return manager.intiateDiscountCheck(cik);
        }
    }
}

async function processTestEvent(record: SQSRecord): Promise<void> {
    const cikList = record.body
        .split(CONSTANTS.GLOBAL.NEW_LINE)
        .map(raw => raw.trim())
        .filter(trimmed => trimmed !== CONSTANTS.GLOBAL.EMPTY);
    for (let cik of cikList) {
        await manager.intiateDiscountCheck(cik);
        await sleep(1000 * frequency);
    }
}
