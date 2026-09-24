import axios from 'axios';

export const handleOpenAI = async (providerConfig: any, body: any) => {
  const apiKey = providerConfig.api_key;
  const baseUrl = providerConfig.base_url || 'https://api.openai.com/v1';

  try {
    const response = await axios.post(`${baseUrl}/chat/completions`, body, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data;
  } catch (error: any) {
    if (error.response) {
      throw new Error(`OpenAI API error: ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
};
