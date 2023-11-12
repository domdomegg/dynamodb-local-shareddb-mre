import { mkdirSync, createWriteStream, existsSync } from "node:fs";
import axios from "axios"
import extract from "extract-zip"
import { join } from "node:path";
import { spawn } from "node:child_process";
import { CreateTableCommand, DynamoDBClient, GetItemCommand, ListTablesCommand, PutItemCommand } from '@aws-sdk/client-dynamodb'

const main = async () => {
  // Get DynamoDB versions
  await downloadDynamoDB("2022-08-09")
  await downloadDynamoDB("latest")

  // Test dynamodb versions
  await testDynamoDB("2022-08-09")
  await testDynamoDB("latest")

  process.exit()
}

const downloadDynamoDB = async (version: string) => {
  if (existsSync(join(__dirname, ".dynamodb", version, "DynamoDBLocal.jar"))) {
    console.warn(`Already downloaded dynamodb local ${version} exists, skipping (delete the .dynamodb folder if this is a mistake)...`)
    return;
  }

  console.log(`Downloading dynamodb local ${version}...`)
  mkdirSync(join(__dirname, ".dynamodb"), { recursive: true })
  await downloadFile(
    `https://s3.eu-central-1.amazonaws.com/dynamodb-local-frankfurt/dynamodb_local_${version}.zip`,
    join(__dirname, ".dynamodb", `${version}.zip`)
  )
  await extract(
    join(__dirname, ".dynamodb", `${version}.zip`),
    { dir: join(__dirname, ".dynamodb", version) }
  )
  console.log(`Downloaded dynamodb local ${version}`)
}

const downloadFile = async (url: string, location: string) => {
  const response = await axios({
    method: "get",
    url,
    responseType: "stream"
  })
  response.data.pipe(createWriteStream(location));

  return new Promise<void>((resolve, reject) => {
    response.data.on("end", () => {
      resolve();
    });

    response.data.on("error", (err: any) => {
      reject(err);
    });
  });
}

const testDynamoDB = async (version: string) => {
  console.log(`Testing dynamodb local ${version}`)

  // Start dynamodb
  console.log('Starting dynamodb...')
  const libPath = join(__dirname, ".dynamodb", version, "DynamoDBLocal_lib")
  const jarPath = join(__dirname, ".dynamodb", version, "DynamoDBLocal.jar")
  const proc = spawn("java", [`-Djava.library.path=${libPath}`, `-jar`, `${jarPath}`, `-inMemory`], { detached: true, stdio: 'inherit' });
  await wait(5000)

  // Create client
  const client1 = new DynamoDBClient({
    region: "localhost",
    endpoint: "http://localhost:8000",
    credentials: {
      accessKeyId: "accessKey1",
      secretAccessKey: "secret1",
    },
  })

  // Create table
  await client1.send(new CreateTableCommand({
    TableName: "example",
    AttributeDefinitions: [{
      AttributeName: "id",
      AttributeType: "S",
    }],
    KeySchema: [{
      AttributeName: "id",
      KeyType: "HASH",
    }],
    BillingMode: "PAY_PER_REQUEST",
  }))

  // List tables with different credentials
  const client2 = new DynamoDBClient({
    region: "localhost",
    endpoint: "http://localhost:8000",
    credentials: {
      // NB: as we are using a different access key, we _should_ not be able to read the tables
      // This is useful for things like test isolation etc.
      // See: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.UsageNotes.html
      accessKeyId: "accessKey2",
      secretAccessKey: "secret2",
    },
  })
  const res = await client2.send(new ListTablesCommand({}))
  if (res.TableNames?.length !== 0) {
    console.log(`FAIL (${version}): Found table with different access key while sharedDb was disabled! This is a bug.`)
  } else {
    console.log(`PASS (${version}): Table not found when using different access key while sharedDb was disabled.`)
  }

  // Kill dynamodb
  console.log('Stopping dynamodb...')
  proc.kill()
  await wait(1000)
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

main();
