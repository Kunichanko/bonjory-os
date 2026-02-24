import React from 'react'
import supabase from '../../lib/supabase'

export default async function Page() {
  try {
    // Confirm the client exists
    // eslint-disable-next-line no-console
    console.log('Supabase client initialized:', !!supabase)

    // Intentionally query a non-existent table to ensure an error is returned
    const tableName = 'this_table_does_not_exist_please_ignore'
    const { data, error } = await supabase.from(tableName).select('*').limit(1)

    // Log results to the server console so developer can verify behavior
    // eslint-disable-next-line no-console
    console.log('Test query table:', tableName)
    // eslint-disable-next-line no-console
    console.log('Test query data:', data)
    if (error) {
      // eslint-disable-next-line no-console
      console.error('Expected error from non-existent table:', error)
    } else {
      // eslint-disable-next-line no-console
      console.log('No error returned from test query (unexpected).')
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Unexpected exception while running Supabase test query:', err)
  }

  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Supabase Test</h1>
      <p>Check the server console — it logs the test query result and any errors.</p>
    </main>
  )
}
