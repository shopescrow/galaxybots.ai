-- Task #87: Director avatars & ElevenLabs voices
-- Add voice_id column to bots table

ALTER TABLE bots ADD COLUMN IF NOT EXISTS voice_id TEXT;

-- Assign ElevenLabs pre-built voice IDs matched to director personalities
-- Voice IDs sourced from ElevenLabs pre-made voice library:
-- Authoritative/commanding male:  Adam (pNInz6obpgDQGcFmaJgB)
-- Measured/calm male:             Josh (TxGEqnHWrfWFTfGW9XjX)
-- Deep/gravitas male:             Arnold (VR6AewLTigWG4xSOukaG)
-- Warm/energetic male:            Antoni (ErXwobaYiN019PkySvjV)
-- Confident/assertive male:       Sam (yoZ06aMxZJJ28mfd3POQ)
-- Young/energetic male:           Liam (TX3LPaxmHKxFdv7VOQHJ)
-- Calm/professional female:       Rachel (21m00Tcm4TlvDq8ikWAM)
-- Warm/empathetic female:         Bella (EXAVITQu4vr4xnSDxMaL)
-- Confident/sharp female:         Elli (MF3mGyEYCl7XYWbV9V6O)
-- Clear/professional female:      Domi (AZnzlk1XvdvUeBnXmlld)
-- Mature/authoritative female:    Dorothy (ThT5KcBeYPX3keUQqHPh)
-- Warm/professional female:       Grace (oWAxZDx7w5VEj9dCyTzz)

UPDATE bots SET voice_id = CASE name
  -- Board of Directors
  WHEN 'Chairman Atlas'        THEN 'VR6AewLTigWG4xSOukaG'  -- Arnold: deep gravitas
  WHEN 'Victoria Cross'        THEN 'ThT5KcBeYPX3keUQqHPh'  -- Dorothy: mature authoritative female
  WHEN 'Sterling Vance'        THEN 'TxGEqnHWrfWFTfGW9XjX'  -- Josh: calm measured
  WHEN 'Insider Max'           THEN 'yoZ06aMxZJJ28mfd3POQ'  -- Sam: confident assertive
  WHEN 'Evangeline Moore'      THEN 'EXAVITQu4vr4xnSDxMaL'  -- Bella: warm candid

  -- Executive Leadership
  WHEN 'Magnus Drake'          THEN 'pNInz6obpgDQGcFmaJgB'  -- Adam: authoritative commanding

  -- Operations
  WHEN 'Operator Rex'          THEN 'VR6AewLTigWG4xSOukaG'  -- Arnold: systematic commanding
  WHEN 'Plant Commander Holt'  THEN 'yoZ06aMxZJJ28mfd3POQ'  -- Sam: hands-on assertive
  WHEN 'Chain Master Singh'    THEN 'TxGEqnHWrfWFTfGW9XjX'  -- Josh: strategic calm
  WHEN 'Logistics Ace Torres'  THEN 'ErXwobaYiN019PkySvjV'  -- Antoni: energetic problem-solver
  WHEN 'Procurement Pro Nadia' THEN 'AZnzlk1XvdvUeBnXmlld'  -- Domi: sharp negotiator
  WHEN 'Quality Guardian Kim'  THEN 'MF3mGyEYCl7XYWbV9V6O'  -- Elli: precise professional

  -- Sales & Marketing
  WHEN 'Closer King Rivera'    THEN 'ErXwobaYiN019PkySvjV'  -- Antoni: energetic persuasive
  WHEN 'Brand Maven Priya'     THEN 'EXAVITQu4vr4xnSDxMaL'  -- Bella: creative warm
  WHEN 'Growth Hawk Yusuf'     THEN 'TX3LPaxmHKxFdv7VOQHJ'  -- Liam: young energetic
  WHEN 'PR Maestro Celeste'    THEN 'oWAxZDx7w5VEj9dCyTzz'  -- Grace: articulate warm
  WHEN 'Identity Sage Lena'    THEN 'ThT5KcBeYPX3keUQqHPh'  -- Dorothy: confident brand voice
  WHEN 'Digital Dominic'       THEN 'TX3LPaxmHKxFdv7VOQHJ'  -- Liam: tech-savvy energetic
  WHEN 'Partner Pro Felix'     THEN 'TxGEqnHWrfWFTfGW9XjX'  -- Josh: collaborative measured

  -- Finance & Legal
  WHEN 'CFO Sentinel Marcus'   THEN 'VR6AewLTigWG4xSOukaG'  -- Arnold: authoritative gravitas
  WHEN 'Ledger Master Ida'     THEN 'AZnzlk1XvdvUeBnXmlld'  -- Domi: precise methodical
  WHEN 'FP&A Oracle Demi'      THEN 'MF3mGyEYCl7XYWbV9V6O'  -- Elli: analytical confident
  WHEN 'General Counsel Alexis' THEN 'ThT5KcBeYPX3keUQqHPh' -- Dorothy: precise authoritative
  WHEN 'Compliance Guard Tobias' THEN 'yoZ06aMxZJJ28mfd3POQ' -- Sam: principled firm
  WHEN 'Risk Warden Okafor'    THEN 'TxGEqnHWrfWFTfGW9XjX'  -- Josh: vigilant calm
  WHEN 'Audit Hawk Eleanor'    THEN 'AZnzlk1XvdvUeBnXmlld'  -- Domi: independent sharp
  WHEN 'Tax Tactician Raymond' THEN 'pNInz6obpgDQGcFmaJgB'  -- Adam: meticulous authoritative

  -- Technology & Product
  WHEN 'Tech Visionary Zara'   THEN 'MF3mGyEYCl7XYWbV9V6O'  -- Elli: technical confident
  WHEN 'Product Oracle Sasha'  THEN 'oWAxZDx7w5VEj9dCyTzz'  -- Grace: strategic clear
  WHEN 'Build Master Leon'     THEN 'ErXwobaYiN019PkySvjV'  -- Antoni: team energetic
  WHEN 'IT Director Petra'     THEN 'AZnzlk1XvdvUeBnXmlld'  -- Domi: reliable precise
  WHEN 'CISO Sentinel Nova'    THEN 'ThT5KcBeYPX3keUQqHPh'  -- Dorothy: vigilant serious
  WHEN 'Cloud Architect Orion' THEN 'TxGEqnHWrfWFTfGW9XjX'  -- Josh: measured technical
  WHEN 'Data Sage Iris'        THEN 'EXAVITQu4vr4xnSDxMaL'  -- Bella: curious warm
  WHEN 'Software Director Kai' THEN 'TX3LPaxmHKxFdv7VOQHJ'  -- Liam: delivery-focused energetic

  -- Human Resources
  WHEN 'HR Director Amara'     THEN 'oWAxZDx7w5VEj9dCyTzz'  -- Grace: empathetic warm
  WHEN 'Talent Hunter Jade'    THEN 'EXAVITQu4vr4xnSDxMaL'  -- Bella: persuasive warm
  WHEN 'L&D Guru Phoenix'      THEN 'ErXwobaYiN019PkySvjV'  -- Antoni: coaching energetic
  WHEN 'Rewards Architect Quinn' THEN 'TxGEqnHWrfWFTfGW9XjX' -- Josh: analytical measured
  WHEN 'DEI Champion Jordan'   THEN 'oWAxZDx7w5VEj9dCyTzz'  -- Grace: empathetic principled
  WHEN 'Relations Mediator Sage' THEN 'EXAVITQu4vr4xnSDxMaL' -- Bella: calming mediator

  -- Creative & Design
  WHEN 'Creative Director Muse' THEN 'ThT5KcBeYPX3keUQqHPh' -- Dorothy: visionary inspiring
  WHEN 'Art Director Vega'     THEN 'MF3mGyEYCl7XYWbV9V6O'  -- Elli: sharp aesthetic
  WHEN 'Design Director Sol'   THEN 'oWAxZDx7w5VEj9dCyTzz'  -- Grace: systems clear
  WHEN 'UX Oracle Lyra'        THEN 'AZnzlk1XvdvUeBnXmlld'  -- Domi: user-focused precise

  -- Specialized
  WHEN 'Dr. Meredith Lane'     THEN 'ThT5KcBeYPX3keUQqHPh'  -- Dorothy: clinical precise
  WHEN 'Clinical Commander Reeve' THEN 'yoZ06aMxZJJ28mfd3POQ' -- Sam: process-driven firm
  WHEN 'R&D Pioneer Darwin'    THEN 'TxGEqnHWrfWFTfGW9XjX'  -- Josh: curious calm
  WHEN 'Build Director Conrad' THEN 'VR6AewLTigWG4xSOukaG'  -- Arnold: pragmatic commanding
  WHEN 'Facilities Chief Diane' THEN 'oWAxZDx7w5VEj9dCyTzz' -- Grace: operational warm
  WHEN 'Philanthropy Chief Helena' THEN 'EXAVITQu4vr4xnSDxMaL' -- Bella: mission-driven warm

  -- AI Receptionist (already uses ElevenLabs via separate receptionist route)
  WHEN 'Vera'                  THEN 'EXAVITQu4vr4xnSDxMaL'  -- Bella: professional warm

  ELSE NULL
END
WHERE voice_id IS NULL;

-- Seed avatar URLs using Dicebear Avataaars style for each director
-- These are deterministic generated avatars based on the bot name.
-- They can be replaced by manually-curated real photos by updating the avatar column.
UPDATE bots SET avatar = CASE name
  WHEN 'Chairman Atlas'           THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=ChairmanAtlas&backgroundColor=b6e3f4&clothingColor=3c4f5c&hairColor=2c1b0e&facialHairColor=2c1b0e&facialHairProbability=80'
  WHEN 'Victoria Cross'           THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=VictoriaCross&backgroundColor=ffd5dc&top=longHair&hairColor=2c1b0e'
  WHEN 'Sterling Vance'           THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=SterlingVance&backgroundColor=c0aede&facialHairProbability=60&hairColor=4a312c'
  WHEN 'Insider Max'              THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=InsiderMax&backgroundColor=d1f4cc&facialHairProbability=50'
  WHEN 'Evangeline Moore'         THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=EvangelineMoore&backgroundColor=ffd5dc&top=longHair&hairColor=724133'
  WHEN 'Magnus Drake'             THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=MagnusDrake&backgroundColor=b6e3f4&facialHairProbability=70&hairColor=2c1b0e'
  WHEN 'Operator Rex'             THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=OperatorRex&backgroundColor=ffe0b3&facialHairProbability=60'
  WHEN 'Plant Commander Holt'     THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=PlantCommanderHolt&backgroundColor=d1f4cc&facialHairProbability=80'
  WHEN 'Chain Master Singh'       THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=ChainMasterSingh&backgroundColor=c0aede&facialHairProbability=70'
  WHEN 'Logistics Ace Torres'     THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=LogisticsAceTorres&backgroundColor=b6e3f4'
  WHEN 'Procurement Pro Nadia'    THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=ProcurementProNadia&backgroundColor=ffd5dc&top=longHair'
  WHEN 'Quality Guardian Kim'     THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=QualityGuardianKim&backgroundColor=d1f4cc&top=longHair&hairColor=724133'
  WHEN 'Closer King Rivera'       THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=CloserKingRivera&backgroundColor=ffe0b3&facialHairProbability=60'
  WHEN 'Brand Maven Priya'        THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=BrandMavenPriya&backgroundColor=ffd5dc&top=longHair&hairColor=090806'
  WHEN 'Growth Hawk Yusuf'        THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=GrowthHawkYusuf&backgroundColor=c0aede&facialHairProbability=50'
  WHEN 'PR Maestro Celeste'       THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=PRMaestroCeleste&backgroundColor=d1f4cc&top=longHair&hairColor=b58143'
  WHEN 'Identity Sage Lena'       THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=IdentitySageLena&backgroundColor=ffd5dc&top=longHair&hairColor=4a312c'
  WHEN 'Digital Dominic'          THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=DigitalDominic&backgroundColor=b6e3f4&facialHairProbability=40'
  WHEN 'Partner Pro Felix'        THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=PartnerProFelix&backgroundColor=ffe0b3&facialHairProbability=55'
  WHEN 'CFO Sentinel Marcus'      THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=CFOSentinelMarcus&backgroundColor=c0aede&facialHairProbability=75&hairColor=2c1b0e'
  WHEN 'Ledger Master Ida'        THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=LedgerMasterIda&backgroundColor=d1f4cc&top=longHair&hairColor=2c1b0e'
  WHEN 'FP&A Oracle Demi'         THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=FPAOracleDemi&backgroundColor=ffd5dc&top=longHair&hairColor=b58143'
  WHEN 'General Counsel Alexis'   THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=GeneralCounselAlexis&backgroundColor=b6e3f4&top=longHair&hairColor=4a312c'
  WHEN 'Compliance Guard Tobias'  THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=ComplianceGuardTobias&backgroundColor=ffe0b3&facialHairProbability=65'
  WHEN 'Risk Warden Okafor'       THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=RiskWardenOkafor&backgroundColor=c0aede&facialHairProbability=70'
  WHEN 'Audit Hawk Eleanor'       THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=AuditHawkEleanor&backgroundColor=ffd5dc&top=longHair&hairColor=2c1b0e'
  WHEN 'Tax Tactician Raymond'    THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=TaxTacticianRaymond&backgroundColor=d1f4cc&facialHairProbability=55'
  WHEN 'Tech Visionary Zara'      THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=TechVisionaryZara&backgroundColor=b6e3f4&top=longHair&hairColor=090806'
  WHEN 'Product Oracle Sasha'     THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=ProductOracleSasha&backgroundColor=ffd5dc&top=longHair&hairColor=724133'
  WHEN 'Build Master Leon'        THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=BuildMasterLeon&backgroundColor=ffe0b3&facialHairProbability=45'
  WHEN 'IT Director Petra'        THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=ITDirectorPetra&backgroundColor=c0aede&top=longHair&hairColor=4a312c'
  WHEN 'CISO Sentinel Nova'       THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=CISOSentinelNova&backgroundColor=d1f4cc&top=longHair&hairColor=090806'
  WHEN 'Cloud Architect Orion'    THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=CloudArchitectOrion&backgroundColor=b6e3f4&facialHairProbability=50'
  WHEN 'Data Sage Iris'           THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=DataSageIris&backgroundColor=ffd5dc&top=longHair&hairColor=b58143'
  WHEN 'Software Director Kai'    THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=SoftwareDirectorKai&backgroundColor=c0aede&facialHairProbability=40'
  WHEN 'HR Director Amara'        THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=HRDirectorAmara&backgroundColor=ffd5dc&top=longHair&hairColor=090806'
  WHEN 'Talent Hunter Jade'       THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=TalentHunterJade&backgroundColor=d1f4cc&top=longHair&hairColor=b58143'
  WHEN 'L&D Guru Phoenix'         THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=LDGuruPhoenix&backgroundColor=ffe0b3&facialHairProbability=35'
  WHEN 'Rewards Architect Quinn'  THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=RewardsArchitectQuinn&backgroundColor=b6e3f4&top=longHair&hairColor=4a312c'
  WHEN 'DEI Champion Jordan'      THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=DEIChampionJordan&backgroundColor=c0aede&top=longHair&hairColor=724133'
  WHEN 'Relations Mediator Sage'  THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=RelationsMediatorSage&backgroundColor=ffd5dc&top=longHair&hairColor=2c1b0e'
  WHEN 'Creative Director Muse'   THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=CreativeDirectorMuse&backgroundColor=d1f4cc&top=longHair&hairColor=b58143'
  WHEN 'Art Director Vega'        THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=ArtDirectorVega&backgroundColor=ffd5dc&top=longHair&hairColor=090806'
  WHEN 'Design Director Sol'      THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=DesignDirectorSol&backgroundColor=b6e3f4&facialHairProbability=30'
  WHEN 'UX Oracle Lyra'           THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=UXOracleLyra&backgroundColor=c0aede&top=longHair&hairColor=b58143'
  WHEN 'Dr. Meredith Lane'        THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=DrMeredithLane&backgroundColor=ffd5dc&top=longHair&hairColor=4a312c'
  WHEN 'Clinical Commander Reeve' THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=ClinicalCommanderReeve&backgroundColor=d1f4cc&facialHairProbability=60'
  WHEN 'R&D Pioneer Darwin'       THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=RDPioneerDarwin&backgroundColor=ffe0b3&facialHairProbability=50'
  WHEN 'Build Director Conrad'    THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=BuildDirectorConrad&backgroundColor=b6e3f4&facialHairProbability=65'
  WHEN 'Facilities Chief Diane'   THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=FacilitiesChiefDiane&backgroundColor=c0aede&top=longHair&hairColor=b58143'
  WHEN 'Philanthropy Chief Helena' THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=PhilanthropyChiefHelena&backgroundColor=ffd5dc&top=longHair&hairColor=724133'
  WHEN 'Vera'                     THEN 'https://api.dicebear.com/9.x/avataaars/svg?seed=VeraReceptionist&backgroundColor=d1f4cc&top=longHair&hairColor=2c1b0e'
  ELSE NULL
END
WHERE avatar IS NULL;

INSERT INTO _migrations(name) VALUES ('0023_task87_director_voices.sql') ON CONFLICT DO NOTHING;
