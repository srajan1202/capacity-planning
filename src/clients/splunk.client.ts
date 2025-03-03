import axios from "axios"
import qs from "querystring"
import { SplunkConfig } from "../types/splunk.types"

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0" // Disable SSL certificate validation

export class SplunkClient {
	splunkUrl: string
	token?: string
	username?: string
	password?: string
	constructor({ url, token, password, username }: SplunkConfig) {
		this.splunkUrl = url
		this.token = token
		this.username = username
		this.password = password
	}

	async searchDataByRange(index, startTime, endTime) {
		return await this.search(`search index=${index} earliest="${startTime}" latest="${endTime}"`)
	}

	async searchData(index) {
		return await this.search(`search index=${index}`)
	}

	async search(searchQuery) {
		let data = qs.stringify({
			search: searchQuery,
			output_mode: "json",
			adhoc_search_level: "smart",
		})

		let config = {
			method: "post",
			maxBodyLength: Infinity,
			url: `${this.splunkUrl}/services/search/jobs`,
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Authorization: this.getAuthToken(),
			},
			data: data,
		}

		try {
			const responseSid = await axios.request(config)
			const sid = responseSid.data.sid
			let data = ""
			do {
				await this.sleep(50)
				data = await this.getSearchData(sid)
			} while (data === "")
			return data
		} catch (error) {
			await this.sleep(50)
			return await this.search(searchQuery)
		}
	}

	async sleep(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms))
	}

	async getSearchData(sid) {
		let data = qs.stringify({
			output_mode: "json",
		})

		let config = {
			method: "get",
			maxBodyLength: Infinity,
			url: `${this.splunkUrl}/services/search/jobs/${sid}/results`,
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Authorization: this.getAuthToken(),
			},
			data: data,
		}
		try {
			const response = await axios.request(config)
			return response.data
		} catch (error) {
			throw error
		}
	}

	async getIndexes() {
		try {
			const indexes = (
				await this.search(`| rest /services/data/indexes | table title currentDBSizeMB totalEventCount repFactor`)
			).results
			const map = {} //remove duplicate indexes
			return indexes.filter((index) => {
				if (map[index.title]) {
					return false
				} else {
					map[index.title] = true
					return true
				}
			})
		} catch (error) {
			throw error
		}
	}

	getAuthToken() {
		if (this.token) {
			return `Bearer ${this.token}`
		} else {
			return this.getBasicAuthToken()
		}
	}

	getBasicAuthToken() {
		const credentials = `${this.username}:${this.password}`
		const base64Credentials = Buffer.from(credentials).toString("base64")
		return `Basic ${base64Credentials}`
	}

	async getCurrentIndexedDataSizeInMB() {
		let data = qs.stringify({
			output_mode: "json",
		})

		let config = {
			method: "get",
			maxBodyLength: Infinity,
			url: `${this.splunkUrl}/services/data/indexes`,
			headers: {
				output_mode: "json",
				"Content-Type": "application/x-www-form-urlencoded",
				Authorization: this.getAuthToken(),
			},
			data: data,
		}

		const response = await axios.request(config)
		const totalSizeInMb = response.data.entry.reduce((sum, e) => sum + parseFloat(e.content.currentDBSizeMB), 0)
		return totalSizeInMb
	}

	async getNodeCounts() {
		const data = await this.search(`| rest /services/server/info splunk_server=*
| table title host host_fqdn guid version serverName server_roles numberOfCores numberOfVirtualCores os_build os_name os_version physicalMemoryMB`)
		const getCountByRole = (role) => {
			return data.results.map((node) => node.server_roles).filter((roles) => roles.indexOf(role) > -1).length
		}
		return {
			indexer: getCountByRole("indexer"),
			searchHead: getCountByRole("search_head"),
			nodes: data.results.length,
		}
	}

	async getDefaultrepFactors() {
		const data = await this.search(`| rest /services/data/indexes | table title repFactor`)
		return data.results.map((index) => ({
			name: index.title,
			repFactor: index.repFactor,
		}))
	}

	async evaluateRawDataStorage(indexSpecs) {
		const totalStorage = indexSpecs.reduce((acc, index) => {
			const repFactor = index.repFactor === "auto" ? 3 : index.repFactor === 0 ? 1 : Math.ceil(index.repFactor)

			return acc + index.totalIndexSizeGB / repFactor
		}, 0)

		return totalStorage
	}

	async getIndexSpecs() {
		const indexes = await this.getIndexes()
		const indexSpecs = await Promise.all(
			indexes.map(async (index) => {
				const sizeData = await this.getIndexSize(index.title)
				const totalIndexSizeGB = sizeData.results[0]?.totalIndexSizeGB?.replace(" GB", "") || "0"

				return {
					name: index.title,
					specs: {
						preview: `Event Counts:${index.totalEventCount} Size:${index.currentDBSizeMB}MB`,
						totalEventCount: parseInt(index.totalEventCount),
						currentDBSizeMB: parseInt(index.currentDBSizeMB),
						replicationFactor: index.repFactor,
						totalIndexSizeGB: parseFloat(totalIndexSizeGB),
					},
				}
			})
		)
		return indexSpecs
	}

	async prepareElasticIndex(storageByIndex) {
		const elasticIndexes = []
		Object.keys(storageByIndex).forEach((key) =>
			elasticIndexes.push({
				name: key,
				storage: storageByIndex[key],
			})
		)
		return elasticIndexes
	}

	async getIndexSize(indexName) {
		const data = await this.search(
			`| rest splunk_server_group=dmc_group_indexer splunk_server_group="*" /services/data/indexes/${indexName}
            | join title splunk_server type=outer [| rest /services/data/indexes-extended/${indexName}]
            | eval bucketCount = coalesce(total_bucket_count, 0)
            | eval eventCount = coalesce(totalEventCount, 0)
            | eval coldBucketSize = coalesce('bucket_dirs.cold.bucket_size', 'bucket_dirs.cold.size', 0)
            | eval coldBucketSizeGB = round(coldBucketSize/ 1024, 2)
            | eval coldBucketMaxSizeGB = if(isnull('coldPath.maxDataSizeMB') OR 'coldPath.maxDataSizeMB' = 0, "unlimited", round('coldPath.maxDataSizeMB' / 1024, 2))
            | eval coldBucketUsageGB = coldBucketSizeGB." / ".coldBucketMaxSizeGB
            | eval homeBucketSizeGB = coalesce(round((total_size - coldBucketSize) / 1024, 2), 0.00)
            | eval homeBucketMaxSizeGB = round('homePath.maxDataSizeMB' / 1024, 2)
            | eval homeBucketMaxSizeGB = if(homeBucketMaxSizeGB > 0, homeBucketMaxSizeGB, "unlimited")
            | eval homeBucketUsageGB = homeBucketSizeGB." / ".homeBucketMaxSizeGB
            | eval dataAgeDays = coalesce(round((now() - strptime(minTime,"%Y-%m-%dT%H:%M:%S%z")) / 86400, 0), 0)
            | eval frozenTimePeriodDays = round(frozenTimePeriodInSecs / 86400, 0)
            | eval frozenTimePeriodDays = if(frozenTimePeriodDays > 0, frozenTimePeriodDays, "unlimited")
            | eval freezeRatioDays = dataAgeDays." / ".frozenTimePeriodDays
            | eval indexSizeGB = if(currentDBSizeMB >= 1 AND totalEventCount >=1, round(currentDBSizeMB/1024, 2), 0.00)
            | eval maxTotalDataSizeGB = round(maxTotalDataSizeMB / 1024, 2)
            | eval indexMaxSizeGB = if(maxTotalDataSizeGB > 0, maxTotalDataSizeGB, "unlimited")
            | eval indexSizeUsageGB = indexSizeGB." / ".indexMaxSizeGB
            | eval indexSizeUsagePerc = if(isNum(indexMaxSizeGB) AND (indexMaxSizeGB > 0), round(indexSizeGB / indexMaxSizeGB * 100, 2)."%", "N/A")
            | eval total_raw_size = coalesce(total_raw_size, 0) | stats sum(indexSizeGB) as totalIndexSizeGB
                        | eval totalIndexSizeGB = totalIndexSizeGB." GB"
`
		)
		return data
	}

	async getBucketSizes(indexSpecs, compressionRatio, expansionRatio) {
		const data = await this.search(`
      | dbinspect index=*
        | stats sum(sizeOnDiskMB) as sizeOnDiskMB sum(eventCount) as eventCount dc(bucketId) as totalBuckets by index state
        | rename state as bucket`)

		let total = 0
		const bucketTotals = data.results.reduce((acc, curr) => {
			const indexSpec = indexSpecs.find((spec) => spec.name === curr.index)
			let replicationFactor = indexSpec
				? indexSpec.specs.replicationFactor === "auto"
					? 2
					: Number(indexSpec.specs.replicationFactor)
				: 2

			// Ensure replication factor is at least 1
			if (replicationFactor === 0) replicationFactor = 1

			if (!curr.index.startsWith("_")) {
				const adjustedSize = parseFloat(curr.sizeOnDiskMB) / replicationFactor
				acc[curr.bucket] =
					(acc[curr.bucket] || 0) +
					Math.ceil(adjustedSize * compressionRatio * expansionRatio)
				total = total + Math.ceil(adjustedSize * compressionRatio * expansionRatio)
			}
			return acc
		}, {})

		const rawTotals = data.results.reduce((acc, curr) => {
			const indexSpec = indexSpecs.find((spec) => spec.name === curr.index)
			let replicationFactor = indexSpec
				? indexSpec.specs.replicationFactor === "auto"
					? 2
					: Number(indexSpec.specs.replicationFactor)
				: 2

			// Ensure replication factor is at least 1
			if (replicationFactor === 0) replicationFactor = 1
			if (!curr.index.startsWith("_")) {
				const adjustedSize = parseFloat(curr.sizeOnDiskMB) / replicationFactor
				acc[curr.bucket] = (acc[curr.bucket] || 0) + Math.ceil(adjustedSize * compressionRatio)
				total = total + Math.ceil(adjustedSize * compressionRatio * expansionRatio)
			}
			return acc
		}, {})

		const storageByIndex = data.results
			.map((currentBucket) => {
				const indexSpec = indexSpecs.find((spec) => spec.name === currentBucket.index)
				if (currentBucket.index.startsWith("_")) {
					return
				}

				let replicationFactor = indexSpec
					? indexSpec.specs.replicationFactor === "auto"
						? 2
						: Number(indexSpec.specs.replicationFactor)
					: 2

				// Ensure replication factor is at least 1
				if (replicationFactor === 0) replicationFactor = 1

				const adjustedSize = parseFloat(currentBucket.sizeOnDiskMB) / replicationFactor
				return {
					name: currentBucket.index,
					storage: Math.ceil(adjustedSize * compressionRatio * expansionRatio),
				}
			})
			.filter((index) => !!index)
			.reduce((accumulator, currentIndex) => {
				accumulator[currentIndex.name] = (accumulator[currentIndex.name] || 0) + currentIndex.storage
				return accumulator
			}, {})
		return {
			results: data.results,
			totals: bucketTotals,
			storage: total,
			storageByIndex: storageByIndex,
			rawTotals: rawTotals,
		}
	}
	async getNodeSpecs() {
		const data = await this.search(
			`| rest /services/server/status/partitions-space 
       | table splunk_server mount_point capacity available
        `
		)

		return data.results
			.filter((index) => index.mount_point === "/data")
			.map((index) => ({
				name: index.splunk_server,
				specs: {
					preview: `Mount:${index.mount_point} Disk:${parseInt(
						`${index.capacity - index.available}`
					)}/${parseInt(index.capacity)}MB`,
					diskAvailable: parseInt(index.available),
					diskUsed: parseInt(`${index.capacity - index.available}`),
					diskSize: parseInt(index.capacity),
				},
			}))
	}
}
