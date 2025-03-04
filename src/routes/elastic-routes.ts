import { Router, Request, Response } from "express"
import { SplunkClient } from "../clients/splunk.client"
import { ElasticCloudClient } from "../clients/elastic-cloud.client"

const router = Router()

router.post("/deployments", async (req: Request, res: Response) => {
	try {
		const { payload, elasticCloudApiKey } = req.body
		const elasticCloud = new ElasticCloudClient(elasticCloudApiKey)
		const template = elasticCloud.prepareDeploymentPayload(payload)
		await elasticCloud.createDeployment(template)
	} catch (error) {
		console.error("Error creating cluster:", error.response?.data || error.message)
		res.status(500).json({
			error: error.response?.data || "Failed to create cluster",
		})
	}
})

router.get("/regions", async (req, res) => {
	const elasticCloud = new ElasticCloudClient({ apiKey: "" })
	const regions = await elasticCloud.getRegions()
	res.send(regions)
})

router.get("/hardware-profiles", async (req, res) => {
	const elasticCloud = new ElasticCloudClient({ apiKey: "" })
	const profiles = await elasticCloud.getHardwareProfile()
	res.send(profiles)
})

router.get("/elasticsearch/versions", async (req, res) => {
	const elasticCloud = new ElasticCloudClient({ apiKey: "" })
	const versions = await elasticCloud.getVersions()
	res.send(versions)
})

router.post("/prepare", async (req, res) => {
	try {
		const { url, username, password } = req.body.splunk
		const splunk = new SplunkClient({ url: url, username, password })
		const [nodeCounts, indexSpecs, nodeSpecs] = await Promise.all([
			splunk.getNodeCounts(),
			splunk.getIndexSpecs(),
			splunk.getNodeSpecs(),
		])
		const bucketSizes = await splunk.getBucketSizes(indexSpecs, 2, 1.5) //splunk compression factor is 50% and ES expansion factor is 1.5 times
		// const rawIndexStorage = await splunk.evaluateRawDataStorage(indexSpecs);
		// console.log(rawIndexStorage);

		const currentSplunkArchDetail = {
			totalNodes: nodeCounts.nodes,
			totalStorage: nodeSpecs.reduce((sum, node) => sum + node.specs.diskUsed, 0),
			totalIndexer: nodeCounts.indexer,
			indexSpecs: indexSpecs,
			nodeSpecs: nodeSpecs,
			hot: bucketSizes.rawTotals.hot ? bucketSizes.rawTotals.hot : 0,
			warm: bucketSizes.rawTotals.warm ? bucketSizes.rawTotals.warm : 0,
			cold: bucketSizes.rawTotals.cold ? bucketSizes.rawTotals.cold : 0,
			frozen: bucketSizes.rawTotals.frozen ? bucketSizes.rawTotals.frozen : 0,
		}
		const elasticIndexes = await splunk.prepareElasticIndex(bucketSizes.storageByIndex)
		const equivalentElasticCloudArch = {
			deploymentTemplateId: "gcp-general-purpose",
			region: "gcp-asia-east1",
			clusterName: "elstic-cluster",
			indexes: elasticIndexes,
			elasticVersion: "8.7.0",
			advanceSettings: {
				hot: {
					zoneCount: 1,
					instanceConfigurationId: "",
					nodeCount: 3,
					size: bucketSizes.totals.hot ? bucketSizes.totals.hot : 0,
				},
				warm: {
					zoneCount: 1,
					instanceConfigurationId: "",
					nodeCount: 3,
					size: bucketSizes.totals.warm ? bucketSizes.totals.warm : 0,
				},
				cold: {
					zoneCount: 1,
					instanceConfigurationId: "",
					nodeCount: 3,
					size: bucketSizes.totals.cold ? bucketSizes.totals.cold : 0,
				},
				frozen: {
					zoneCount: 1,
					instanceConfigurationId: "",
					nodeCount: 3,
					size: bucketSizes.totals.frozen ? bucketSizes.totals.frozen : 0,
				},
			},
			storageNeeded: bucketSizes.totals.hot
				? bucketSizes.totals.hot
				: 0 + bucketSizes.totals.warm
					? bucketSizes.totals.warm
					: 0 + bucketSizes.totals.cold
						? bucketSizes.totals.cold
						: 0 + bucketSizes.totals.frozen
							? bucketSizes.totals.frozen
							: 0,
			replication: 2,
			bufferPercentage: 15,
			totalStorageElastic: Math.ceil(
				(bucketSizes.totals.hot
					? bucketSizes.totals.hot
					: 0 + bucketSizes.totals.warm
						? bucketSizes.totals.warm
						: 0 + bucketSizes.totals.cold
							? bucketSizes.totals.cold
							: 0 + bucketSizes.totals.frozen
								? bucketSizes.totals.frozen
								: 0) *
					(1 + 15 * 0.01)
			), //taking 15 % buffer storage
		}

		res.send({ currentSplunkArchDetail, equivalentElasticCloudArch })
	} catch (err) {
		console.log(err)
		res.sendStatus(400)
	}
})

router.post("/prepare-iac", async (req, res) => {
	try {
		const data = req.body
		const elasticCloud = new ElasticCloudClient({ apiKey: "" })
		const payload = elasticCloud.prepareDeploymentPayload(data)
		res.send({
			curl: `
        curl --location 'https://api.elastic-cloud.com/api/v1/deployments' \
        --header 'Content-Type: "application/json"' \
        --header 'Authorization: "${data.apiKey}"' \
        --data '${JSON.stringify(payload)}'
        `,
		})
	} catch (err) {
		console.log(err.message)
		// console.log(err);
		res.sendStatus(400)
	}
})

export default router
