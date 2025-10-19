// Test the mapping functions directly
const nodeTypeMap = {
  author: "AUTHOR",
  brand: "BRAND",
  topic: "TOPIC",
  hashtag: "HASHTAG",
  influencer: "INFLUENCER",
  location: "LOCATION",
  organization: "ORGANIZATION",
  product: "PRODUCT",
  event: "EVENT",
  service: "ORGANIZATION", // Map service to organization
  credit_card: "PRODUCT", // Map credit_card to product
};

const edgeTypeMap = {
  mentions: "MENTIONS",
  sentiment: "SENTIMENT",
  interacts_with: "INTERACTS_WITH",
  competes_with: "COMPETES_WITH",
  discusses: "DISCUSSES",
  shares_topic: "SHARES_TOPIC",
  follows: "FOLLOWS",
  collaborates: "COLLABORATES",
  influences: "INFLUENCES",
  located_in: "LOCATED_IN",
  part_of: "PART_OF",
  related_to: "RELATED_TO",
  offers: "RELATED_TO", // Map offers to related_to
  used_for: "RELATED_TO", // Map used_for to related_to
  uses_hashtag: "RELATED_TO", // Map uses_hashtag to related_to
};

function mapNodeType(nodeType) {
  return nodeTypeMap[nodeType?.toLowerCase()] || "ORGANIZATION";
}

function mapEdgeType(edgeType) {
  return edgeTypeMap[edgeType?.toLowerCase()] || "RELATED_TO";
}

// Test with the actual LLM response
const llmResponse = {
  nodes: [
    {
      type: "organization",
      label: "中銀香港",
      properties: {},
    },
    {
      type: "organization",
      label: "榮華餅家",
      properties: {},
    },
    {
      type: "product",
      label: "榮華月餅",
      properties: {},
    },
    {
      type: "service",
      label: "BoC Pay+",
      properties: {},
    },
    {
      type: "credit_card",
      label: "中銀信用卡",
      properties: {},
    },
  ],
  edges: [
    {
      sourceNodeLabel: "中銀香港",
      targetNodeLabel: "榮華月餅",
      edgeType: "mentions",
      properties: {},
    },
    {
      sourceNodeLabel: " 榮華餅家",
      targetNodeLabel: " 榮華月餅",
      edgeType: "offers",
      properties: {},
    },
    {
      sourceNodeLabel: " 中銀信用卡",
      targetNodeLabel: "榮華月餅",
      edgeType: "used_for",
      properties: {},
    },
    {
      sourceNodeLabel: "BoC Pay+",
      targetNodeLabel: "榮華月餅",
      edgeType: "used_for",
      properties: {},
    },
  ],
};

console.log("Testing node type mapping:");
llmResponse.nodes.forEach((node) => {
  const mappedType = mapNodeType(node.type);
  console.log(`${node.type} -> ${mappedType}`);
});

console.log("\nTesting edge type mapping:");
llmResponse.edges.forEach((edge) => {
  const mappedType = mapEdgeType(edge.edgeType);
  console.log(`${edge.edgeType} -> ${mappedType}`);
});

console.log("\nTesting label trimming:");
llmResponse.edges.forEach((edge) => {
  const trimmedSource = edge.sourceNodeLabel?.trim();
  const trimmedTarget = edge.targetNodeLabel?.trim();
  console.log(`"${edge.sourceNodeLabel}" -> "${trimmedSource}"`);
  console.log(`"${edge.targetNodeLabel}" -> "${trimmedTarget}"`);
});

console.log("\nFinal transformed result:");
const transformedResult = {
  nodes: llmResponse.nodes.map((node) => ({
    type: mapNodeType(node.type),
    label: node.label?.trim(),
    properties: node.properties,
  })),
  edges: llmResponse.edges.map((edge) => ({
    sourceNodeLabel: edge.sourceNodeLabel?.trim(),
    targetNodeLabel: edge.targetNodeLabel?.trim(),
    edgeType: mapEdgeType(edge.edgeType),
    properties: edge.properties,
  })),
};

console.log(JSON.stringify(transformedResult, null, 2));
