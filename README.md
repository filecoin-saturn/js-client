<h1 align="center">
	<br>
	:dart:
	<br>
	<br>
	Saturn Javascript Client
	<br>
	<br>
	<br>
</h1>

This is the official JavaScript client for Filecoin Saturn. It is a work in progress and is not yet ready for production use.

## Installation

```bash
npm install @filecoin-saturn/js-client
```

# Usage
First you initialize the saturn client as follows:
```javascript
import { Saturn } from '@filecoin-saturn/js-client';

const saturn = new Saturn({
    clientKey: "...", // Key used for verification
    // ... other options
});
```

To fetch content using the client:

```javascript
const cidPath = 'https://samplepath/ipfs/{cid}';
const options = {
  fallbackLimit: 5,
  raceNodes: true,
};

(async () => {
  try {
    for await (const chunk of saturn.fetchContentWithFallback(cidPath, options)) {
      // Process each chunk of data
      console.log(chunk);
    }
  } catch (error) {
    console.error('Error fetching content:', error);
  }
})();
```

# Concepts

## Node Management
The Saturn class in the CDN client module intelligently manages a cache of server nodes to optimize content delivery. This cache includes a list of nodes, which are prioritized based on their proximity to the operator, ensuring minimal latency. The nodes are sorted considering two key factors: weight and distance. Weight is an indicative measure of a node's capabilities, such as its capacity and speed. Distance, on the other hand, refers to the network distance from the requester, favoring nodes that are geographically closer to reduce latency. The combination of these factors allows the system to balance the load across the network while ensuring efficient and reliable content delivery.

## Reliability
Reliability in content fetching is crucial, and the Saturn client addresses this through its fallback mechanism. If a request to a primary node fails, the system automatically attempts to fetch the content from alternative nodes. This strategy significantly reduces error rates by providing multiple potential sources for content, thus ensuring high availability and resilience against individual node failures.

## Fetch Optimization
Fetch optimization in the Saturn client is achieved through two main strategies: racing nodes and adaptive node selection. Racing nodes involve sending simultaneous requests to different nodes and using the first successful response, which greatly reduces wait times and optimizes latency. Adaptive node selection dynamically adjusts which nodes are selected for requests based on real-time performance data. This approach ensures optimal performance under varying network conditions and contributes to effective load balancing by preventing any single node from being overwhelmed. This mechanism operates as follows:
    - Primary Request: Initially, the system attempts to fetch content from the primary node, which is usually the closest or most optimal based on the current network conditions.
    - Failure Detection: If this initial request fails, either due to server issues, network problems, or any other interruption, the system immediately recognizes this failure.
    - Sequential Fallback: The system then sequentially tries to fetch the content from alternative nodes. These nodes are selected based on their priority in the cached list, which is determined by factors like their performance metrics and proximity to the requestor.

## Cache Affinity
Cache affinity is enhanced by the use of consistent hashing in the Saturn client. Consistent hashing is a method that distributes requests across nodes in a way that minimizes reorganization when nodes change. It ensures that requests for specific content are consistently directed to the same nodes, increasing the likelihood of cache hits. This technique not only improves cache effectiveness but also contributes to the overall efficiency of the content delivery process.

## Content Verification

The Saturn client incorporates a robust verification mechanism to ensure the integrity and authenticity of the content fetched, especially when dealing with untrusted nodes. This mechanism is crucial in a distributed network environment where data is retrieved from various sources that might not be trusted. It allows the system to detect any corrupted or malicious data early in the process, thereby preventing the propagation of compromised content. The verification process operates on the principle of incremental verification of blocks using CIDs (content identifiers), as detailed below:
Incremental Verification of Blocks
    - Block-Based Fetching: Content in the CDN network is divided into blocks, which are smaller, manageable units of data. This division facilitates easier handling and verification of content.
    - Verification at Retrieval: As each block of content is retrieved from the network, it undergoes immediate verification before being considered valid and used or stored further.
    - Checking Integrity: The verification process involves checking the integrity of each block against known and trusted cryptographic hashes or signatures. This ensures that the content has not been tampered with or altered during transmission.

## Auth and Security
The saturn Client uses JSON Web Tokens (JWTs) for secure authentication within the network. JWT ensures controlled and secure access to content, safeguarding against unauthorized access. Furthermore, the class includes mechanisms to monitor and log the performance of requests, providing valuable data for optimization and troubleshooting. This focus on security and performance monitoring underlines the robust and secure nature of the Saturn CDN client module, ensuring a safe and efficient content delivery environment.

# Contributing

Contributions are welcome. Please open an issue or submit a pull request with your changes.


## License

Dual-licensed under [MIT](https://github.com/filecoin-saturn/L1-node/blob/master/LICENSE-MIT) + [Apache 2.0](https://github.com/filecoin-saturn/L1-node/blob/master/LICENSE-APACHE)
