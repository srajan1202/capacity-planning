import axios from "axios";
import { SplunkConfig } from "../types/splunk.types";
import qs from "qs";

export class SplunkClient {
  config: SplunkConfig;

  constructor(splunkConfig: SplunkConfig) {
    this.config = splunkConfig;
  }

  getAuthToken() {
    if (this.config.token) {
      return `Bearer ${this.config.token}`;
    } else {
      return this.getBasicAuthToken();
    }
  }
  getBasicAuthToken() {
    const credentials = `${this.config.username}:${this.config.password}`;
    const base64Credentials = Buffer.from(credentials).toString("base64");
    return `Basic ${base64Credentials}`;
  }
  async sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  async search(searchQuery: string): Promise<any> {
    let data = qs.stringify({
      search: searchQuery,
      output_mode: "json",
      adhoc_search_level: "smart",
    });

    let config = {
      method: "post",
      maxBodyLength: Infinity,
      url: `${this.config.url}/services/search/jobs`,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: this.getAuthToken(),
      },
      data: data,
    };

    try {
      const responseSid = await axios.request(config);
      const sid = responseSid.data.sid;
      let data = "";
      do {
        await this.sleep(50);
        data = await this.getSearchData(sid);
      } while (data === "");
      return data;
    } catch (error) {
      await this.sleep(50);
      return await this.search(searchQuery);
    }
   }
   async getSearchData(sid: string) {
    let data = qs.stringify({
      output_mode: "json",
    });

    let config = {
      method: "get",
      maxBodyLength: Infinity,
      url: `${this.config.url}/services/search/jobs/${sid}/results`,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: this.getAuthToken(),
      },
      data: data,
    };
    try {
      const response = await axios.request(config);
      return response.data;
    } catch (error) {
      throw error;
    }
  }
}
