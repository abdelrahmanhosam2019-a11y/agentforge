const { createSupabaseContext } = require('@supabase/server');

const token = process.argv[2];
if (!token) { console.log('Usage: node test-auth.js <token>'); process.exit(1); }

const fakeReq = new Request('http://localhost/api/agents', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  }
});

createSupabaseContext(fakeReq, { auth: 'user' }).then(result => {
  console.log('Result type:', typeof result);
  console.log('Result keys:', Object.keys(result));
  if (result.data) {
    console.log('Data keys:', Object.keys(result.data));
    console.log('Auth mode:', result.data.authMode);
    console.log('User claims:', JSON.stringify(result.data.userClaims, null, 2));
  }
  if (result.error) {
    console.log('Error:', result.error);
  }
}).catch(e => {
  console.error('Catch Error:', e.message);
});
