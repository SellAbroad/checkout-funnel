import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({
  region: process.env.DYNAMODB_REGION ?? "eu-west-1",
  ...(process.env.DYNAMODB_ACCESS_KEY_ID && {
    credentials: {
      accessKeyId: process.env.DYNAMODB_ACCESS_KEY_ID,
      secretAccessKey: process.env.DYNAMODB_SECRET_ACCESS_KEY ?? "",
    },
  }),
});

export const dynamoDb = DynamoDBDocumentClient.from(client);
export const ANALYTICS_TABLE = process.env.DYNAMODB_TABLE ?? "prod-analytics";
