const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://pfziaungkeamcvojzfxj.supabase.co',
  'sb_secret_BnsBD1YdujSAcXJt1v-8Pg_7x-EnqDm'
);

async function check() {
  const { data, error } = await supabase.from('agents').select('*').limit(1);
  if (error) {
    console.log('Tables NOT created yet.');
    console.log('Error:', error.message);
    return false;
  }
  console.log('Tables exist! Agents count:', data?.length);
  return true;
}

check().then(ok => {
  if (!ok) {
    console.log('\nRun schema.sql in Supabase Dashboard:');
    console.log('https://supabase.com/dashboard/project/pfziaungkeamcvojzfxj/sql/new');
  }
  process.exit(0);
});
