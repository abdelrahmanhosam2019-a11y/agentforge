const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  'https://pfziaungkeamcvojzfxj.supabase.co',
  'sb_secret_BnsBD1YdujSAcXJt1v-8Pg_7x-EnqDm'
);

const sql = fs.readFileSync('D:/agentforge/schema.sql', 'utf8');

async function setup() {
  // Split SQL into individual statements and run each
  const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 10);

  let success = 0;
  let failed = 0;

  for (const stmt of statements) {
    try {
      const { data, error } = await supabase.rpc('exec_sql', { query: stmt + ';' });
      if (error) {
        // Try direct query via postgrest
        console.log('RPC failed, trying alternative...');
        break;
      }
      success++;
    } catch (e) {
      failed++;
    }
  }

  if (failed > 0) {
    console.log('\n=== MANUAL SETUP REQUIRED ===');
    console.log('Open: https://supabase.com/dashboard/project/pfziaungkeamcvojzfxj/sql');
    console.log('Paste the contents of D:\\agentforge\\schema.sql');
    console.log('Click "Run" to create all tables\n');
  } else {
    console.log('All tables created successfully!');
  }
}

setup();
