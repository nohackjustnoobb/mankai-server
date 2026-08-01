import {
  pipeline,
  type FeatureExtractionPipeline,
} from "@huggingface/transformers";

export const EMBEDDING_MODEL = "Xenova/bge-m3";
export const EMBEDDING_DIMENSIONS = 1024;

const EMBEDDING_DTYPE =
  process.env.EMBEDDING_QUANTIZED === "0" ||
  process.env.EMBEDDING_QUANTIZED === "false"
    ? "fp32"
    : "q8";

const EMBEDDING_CACHE_DIR =
  process.env.EMBEDDING_CACHE_DIR?.trim() || undefined;

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", EMBEDDING_MODEL, {
      dtype: EMBEDDING_DTYPE,
      cache_dir: EMBEDDING_CACHE_DIR,
    }).catch((error) => {
      extractorPromise = null;
      throw error;
    });
  }

  return extractorPromise;
}

export async function embed(text: string): Promise<number[]> {
  const extractor = await getExtractor();
  const output = await extractor(text, {
    pooling: "mean",
    normalize: true,
  });

  return Array.from(output.data) as number[];
}
