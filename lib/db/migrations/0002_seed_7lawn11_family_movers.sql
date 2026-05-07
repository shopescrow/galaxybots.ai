CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM clients WHERE company_name = '7 Lawn 11') THEN
    INSERT INTO clients (company_name, contact_name, contact_email, plan, status, website_url, industry, services_list, target_market, business_context, webhook_secret)
    VALUES (
      '7 Lawn 11',
      '7Lawn11 Owner',
      'info@7lawn11.com',
      'enterprise',
      'active',
      'https://7lawn11.com',
      'Landscaping & Snow Removal',
      ARRAY['Landscape Design', 'Lawn Care', 'Hardscaping', 'Eavestrough Cleaning', '24/7 Snow Removal'],
      'London, Ontario, Canada',
      '7 Lawn 11 is a premier landscaping and snow removal company based in London, Ontario. A+ BBB rated with 15+ years of experience and 1,000+ completed projects. They offer comprehensive outdoor services including landscape design, lawn care maintenance, hardscaping installations, eavestrough cleaning, and 24/7 emergency snow removal. Known for reliability, quality craftsmanship, and exceptional customer service in the London, Ontario market.',
      encode(gen_random_bytes(32), 'hex')
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM clients WHERE company_name = 'Family Movers Canada') THEN
    INSERT INTO clients (company_name, contact_name, contact_email, plan, status, website_url, industry, services_list, target_market, business_context, webhook_secret)
    VALUES (
      'Family Movers Canada',
      'Family Movers Owner',
      'info@familymoverscanada.com',
      'enterprise',
      'active',
      'https://familymoverscanada.replit.app',
      'Moving & Relocation Services',
      ARRAY['Residential Moving', 'Commercial Moving', 'Long Distance Moving', 'Packing Services', 'Storage Solutions'],
      'Canada-wide',
      'Family Movers Canada is a full-service moving and relocation company operating across Canada. They specialize in residential and commercial moves, offering packing services, storage solutions, and long-distance relocations. Their mission is to make moving stress-free for Canadian families and businesses with reliable, professional service from coast to coast.',
      encode(gen_random_bytes(32), 'hex')
    );
  END IF;
END $$;
