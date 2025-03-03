import axios from "axios"
import { getRamInMBCold, getRamInMBHot, getRamInMBWarm } from "../utils/contstants"

export const ELASTIC_CLOUD_URL = "https://api.elastic-cloud.com/api/v1"
const ELASTIC_SEARCH_VERSION = "8.17.0"
const KIBANA_VERSION = "8.17.0"

const getNextValidSize = (size) => {
	const allowedSizes = [2048, 4096, 8192, 16384, 32768, 65536]

	for (let i = 0; i < allowedSizes.length; i++) {
		if (size <= allowedSizes[i]) {
			return allowedSizes[i]
		}
	}
	return allowedSizes[allowedSizes.length - 1]
}

export class ElasticCloudClient {
	apiKey: string
	constructor({ apiKey }: { apiKey: string }) {
		this.apiKey = apiKey
	}

	async createDeployment(payload) {
		try {
			const response = await axios.post(`${ELASTIC_CLOUD_URL}/deployments`, JSON.stringify(payload), {
				headers: {
					"Content-Type": "application/json",
					Authorization: `ApiKey ${this.apiKey}`,
				},
				maxBodyLength: Infinity,
			})
			return {
				message: "Cluster created successfully",
				deployment_id: response.data.id,
			}
		} catch (err) {
			console.error("Failed to deploy", err)
			throw err
		}
	}

	async getRegions() {
		return {
			aws: [
				{
					name: "N. California (us-west-1)",
					id: "aws-us-west-1",
				},
			],
			gcp: [
				{
					name: "Tokyo (ap-northeast-1)",
					id: "gcp-asia-east1",
				},
				{
					name: "Mumbai (asia-south1)",
					id: "gcp-asia-south1",
				},
				{
					name: "N. Virginia (us-east4)",
					id: "gcp-us-east4",
				},
			],
		}
	}

	async getHardwareProfile() {
		return {
			gcp: [
				{
					name: "Storage optimized",
					id: "gcp-storage-optimized",
				},
				{
					name: "General purpose",
					id: "gcp-general-purpose",
				},
				{
					name: "Vector Search optimized",
					id: "gcp-vector-search-optimized",
				},
			],
			aws: [
				{
					name: "Storage optimized",
					id: "aws-storage-optimized",
				},
				{
					name: "General purpose",
					id: "aws-general-purpose",
				},
			],
		}
	}

	async getVersions() {
		return [
			{
				value: "8.17.0",
				display: "8.17.0(latest)",
			},
		]
	}

	prepareDeploymentPayload(data) {
		const { deploymentTemplateId, region, clusterName } = data

		const elasticClusterTopology = this.prepareElasticClusterTopology(data)
		const kibanaTopology = this.prepareKibanaTopology(data)

		return {
			resources: {
				elasticsearch: [
					{
						region: region,
						ref_id: "main-elasticsearch",
						plan: {
							cluster_topology: elasticClusterTopology,
							elasticsearch: {
								version: ELASTIC_SEARCH_VERSION,
								enabled_built_in_plugins: [],
							},
							deployment_template: {
								id: deploymentTemplateId,
							},
						},
					},
				],
				kibana: kibanaTopology,
			},
			name: clusterName,
		}
	}

	prepareElasticClusterTopology(data) {
		const { advanceSettings, region } = data
		const topologies = []
		if (advanceSettings.hot) {
			topologies.push({
				zone_count: 1,
				elasticsearch: {
					node_attributes: {
						data: "hot",
					},
				},
				instance_configuration_id: "gcp.es.datahot.n2.68x16x45",
				node_roles: ["master", "ingest", "transform", "data_hot", "remote_cluster_client", "data_content"],
				id: "hot_content",
				size: {
					value: getRamInMBHot(advanceSettings.hot.size),
					resource: "memory",
				},
			})
		}

		if (advanceSettings.warm) {
			topologies.push({
				zone_count: 1,
				elasticsearch: {
					node_attributes: {
						data: "warm",
					},
				},
				instance_configuration_id: "gcp.es.datawarm.n2.68x10x190",
				node_roles: ["data_warm", "remote_cluster_client"],
				id: "warm",
				size: {
					resource: "memory",
					value: getRamInMBWarm(advanceSettings.warm.size),
				},
			})
		}

		if (advanceSettings.cold) {
			topologies.push({
				zone_count: 1,
				elasticsearch: {
					node_attributes: {
						data: "cold",
					},
				},
				instance_configuration_id: "gcp.es.datacold.n2.68x10x190",
				node_roles: ["data_cold", "remote_cluster_client"],
				id: "cold",
				size: {
					resource: "memory",
					value: getRamInMBCold(advanceSettings.cold.size),
				},
			})
		}

		// if (advanceSettings.frozen) {
		//   topologies.push({
		//     zone_count: 1,
		//     elasticsearch: {
		//       node_attributes: {
		//         data: "frozen",
		//       },
		//     },
		//     instance_configuration_id: "gcp.es.datafrozen.n2.68x10x95",
		//     node_roles: ["data_frozen"],
		//     id: "frozen",
		//     size: {
		//       resource: "memory",
		//       value: Math.ceil(advanceSettings.frozen.size),
		//     },
		//   });
		// }

		// topologies.push({
		//   zone_count: 2,
		//   instance_configuration_id: "gcp.es.master.n2.68x32x45",
		//   node_roles: ["master", "remote_cluster_client"],
		//   id: "master",
		//   size: {
		//     resource: "memory",
		//     value: 4096,
		//   },
		// });

		if (advanceSettings.Authorization) {
			topologies.push({
				zone_count: 2,
				instance_configuration_id: "gcp.es.coordinating.n2.68x16x45",
				node_roles: ["ingest", "remote_cluster_client"],
				id: "coordinating",
				size: {
					resource: "memory",
					value: 2048,
				},
			})
		}

		// if (advanceSettings.machineLearning) {
		//   topologies.push({
		//     zone_count: 1,
		//     instance_configuration_id: "gcp.es.ml.n2.68x32x45",
		//     node_roles: ["ml", "remote_cluster_client"],
		//     id: "ml",
		//     size: {
		//       resource: "memory",
		//       value: 0,
		//     },
		//   });
		// }
		return topologies
	}

	prepareKibanaTopology(data) {
		const { region } = data

		if (true) {
			return [
				{
					elasticsearch_cluster_ref_id: "main-elasticsearch",
					region: region,
					plan: {
						cluster_topology: [
							{
								instance_configuration_id: "gcp.kibana.n2.68x32x45",
								zone_count: 1,
								size: {
									resource: "memory",
									value: 1024,
								},
							},
						],
						kibana: {
							version: KIBANA_VERSION,
						},
					},
					ref_id: "main-kibana",
				},
			]
		}
	}
}
