const axios = require('axios');

async function testGateway() {
  const url = 'http://localhost:3030/v1/chat/completions';
  const data = {
    model: 'gpt-4o',
    messages: [
      { role: 'user', content: 'hi' }
    ],
    stream: false
  };

  console.log('Sending request to:', url);
  try {
    const response = await axios.post(url, data, {
      validateStatus: () => true, // Don't throw on 5xx
      timeout: 10000
    });

    console.log('Status:', response.status);
    console.log('Headers:', JSON.stringify(response.headers, null, 2));
    console.log('Data:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('Request failed:', error.message);
    if (error.response) {
        console.error('Error Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testGateway();
