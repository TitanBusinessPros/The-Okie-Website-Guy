import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  console.log('💳 Payment Processing Function v3.0 started!', req.method)
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.text()
    const jsonData = JSON.parse(body)
    const { action, data } = jsonData
    
    console.log('📋 Request action:', action)
    console.log('📝 Request data:', JSON.stringify(data, null, 2))
    
    // Handle different actions
    if (action === 'create_payment_intent') {
      return await handleCreatePaymentIntent(data)
    } else if (action === 'send_notification') {
      return await handleSendNotification(data)
    } else {
      throw new Error(`Unknown action: ${action}`)
    }

  } catch (error) {
    console.error('💥 CRITICAL ERROR:', error.message)
    console.error('💥 Full error object:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})

// Handle Stripe Payment Intent creation
async function handleCreatePaymentIntent(data: any) {
  console.log('💳 Creating Stripe Payment Intent...')
  
  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
  
  if (!stripeSecretKey) {
    throw new Error('STRIPE_SECRET_KEY not found in environment')
  }
  
    // Calculate total amount based on website package and selected addons
  let totalAmount = data.websitePackage ? 2500 : 0 // Base $25 website cost in cents only if selected
  
  if (data.addons && data.addons.length > 0) {
                const addonPrices: { [key: string]: number } = {
      'social-media': 10000, // $100 (monthly - first month)
      'stripe': 2500, // $25
            'email': 2500, // $25 (yearly)
      'llc': 30000, // $300
      'bookkeeping': 10000, // $100 (monthly - first month)
      'analytics': 2500, // $25
      'trademark': 6000, // $60
      'seo': 2500, // $25
      'automation': 10000 // $100 (monthly - first month)
    }
    
    data.addons.forEach((addon: string) => {
      if (addonPrices[addon]) {
        totalAmount += addonPrices[addon]
      }
    })
  }
  
  console.log('💰 Total amount calculated:', totalAmount, '(cents)')
  
  try {
    const stripeResponse = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        amount: totalAmount.toString(),
        currency: 'usd',
        'metadata[customer_name]': `${data.firstName} ${data.lastName}`,
        'metadata[customer_email]': data.email,
        'metadata[business_name]': data.businessName,
        'metadata[addons]': JSON.stringify(data.addons || [])
      })
    })
    
    const stripeResult = await stripeResponse.json()
    console.log('💳 Stripe response:', JSON.stringify(stripeResult, null, 2))
    
    if (!stripeResponse.ok) {
      throw new Error(`Stripe API Error: ${JSON.stringify(stripeResult)}`)
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        client_secret: stripeResult.client_secret,
        amount: totalAmount
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    console.error('💥 Stripe error:', error)
    throw error
  }
}

// Handle email notification (existing functionality)
async function handleSendNotification(formData: any) {
  console.log('📧 Sending notification email...')
  
  const brevoApiKey = Deno.env.get('BREVO_API_KEY')
  
  if (!brevoApiKey) {
    throw new Error('BREVO_API_KEY not found in environment')
  }
    // Format the addons list
  const addonsText = formData.addons && formData.addons.length > 0 
    ? formData.addons.join(', ') 
    : 'None selected'

  // Create email content
  const emailContent = `
    New ${formData.websitePackage ? 'Website Request' : 'Service Request'} from The Okie Website Guy!
    
    Customer Details:
    - Name: ${formData.firstName} ${formData.lastName}
    - Email: ${formData.email}
    - Phone: ${formData.phone || 'Not provided'}
    - Business Name: ${formData.businessName}
    - Business Type: ${formData.businessType || 'Not specified'}
    
    Website Package ($25): ${formData.websitePackage ? 'YES' : 'NO'}
    Add-ons Requested: ${addonsText}
    
    Customer Message: ${formData.message || 'No additional message'}
    
    Time Submitted: ${new Date().toLocaleString()}
  `

  const emailPayload = {
    sender: {
      name: "The Okie Website Guy",
      email: "titanbusinesspros@gmail.com"
    },
    to: [{
      email: "titanbusinesspros@gmail.com",
      name: "Shawn"
    }],
    subject: `🚀 New ${formData.websitePackage ? '$25 Website' : 'Service'} Request from ${formData.firstName} ${formData.lastName}`,
    htmlContent: emailContent.replace(/\n/g, '<br>'),
    textContent: emailContent
  }
  
  const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': brevoApiKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify(emailPayload)
  })

  const emailResponseText = await emailResponse.text()
  console.log('📬 Brevo response:', emailResponseText)

  if (!emailResponse.ok) {
    let errorDetails
    try {
      errorDetails = JSON.parse(emailResponseText)
    } catch {
      errorDetails = { message: emailResponseText }
    }
    
    throw new Error(`Brevo API Error (${emailResponse.status}): ${JSON.stringify(errorDetails)}`)
  }

  return new Response(
    JSON.stringify({ 
      success: true, 
      message: 'Form submitted and notification sent successfully!' 
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}