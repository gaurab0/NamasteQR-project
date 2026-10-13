const axios = require('axios');

async function testApi() {
  console.log('Sending request to /api/auth/audit-logs/delete');
  try {
    const res = await axios.post('http://localhost:5000/api/auth/audit-logs/delete', {
      filterType: 'ALL'
    });
    console.log('Success:', res.data);
  } catch (err) {
    if (err.response) {
      console.error('API Error Response:', err.response.status, err.response.data);
    } else {
      console.error('Request failed:', err.message);
    }
  }
}

testApi();
