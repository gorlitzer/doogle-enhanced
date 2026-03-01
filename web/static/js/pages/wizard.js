// Doogle v2 — Onboarding Wizard
import { api } from '../api.js';
import { icon, showModal, closeModal } from '../components.js';
import { animateElement } from '../logo-animation.js';

let currentStep = 0;
let cleanupDoogleAnim = null;
const selectedSubs = new Set();
const removedSeeds = new Set();
let customSeeds = '';
let settings = { depth: 3, workers: 4 };
let pollInterval = null;
const expandedGroups = new Set();
const expandedCategories = new Set();
let seedAccordionOpen = false;

// ─── Category Groups with Subcategories ─────────────
const CATEGORY_GROUPS = [
  // ══════════════════════════════════════════════════════
  // GROUP 1: Knowledge & Learning
  // ══════════════════════════════════════════════════════
  {
    id: 'knowledge', name: 'Knowledge & Learning', icon: 'fileText',
    categories: [
      {
        id: 'education', name: 'Education', icon: 'fileText',
        desc: 'Online courses, schools, and academic resources',
        subcategories: [
          { id: 'education-k12', name: 'K-12', seeds: [
            { url: 'https://www.khanacademy.org', label: 'Khan Academy' },
            { url: 'https://www.ck12.org', label: 'CK-12' },
            { url: 'https://www.education.com', label: 'Education.com' },
            { url: 'https://www.pbslearningmedia.org', label: 'PBS LearningMedia' },
          ]},
          { id: 'education-higher', name: 'Higher Ed', seeds: [
            { url: 'https://ocw.mit.edu', label: 'MIT OpenCourseWare' },
            { url: 'https://www.edx.org', label: 'edX' },
            { url: 'https://oyc.yale.edu', label: 'Yale Open Courses' },
            { url: 'https://online.stanford.edu', label: 'Stanford Online' },
          ]},
          { id: 'education-online', name: 'Online Learning', seeds: [
            { url: 'https://www.coursera.org', label: 'Coursera' },
            { url: 'https://www.udemy.com', label: 'Udemy' },
            { url: 'https://www.skillshare.com', label: 'Skillshare' },
            { url: 'https://www.futurelearn.com', label: 'FutureLearn' },
          ]},
          { id: 'education-languages', name: 'Languages', seeds: [
            { url: 'https://www.duolingo.com', label: 'Duolingo' },
            { url: 'https://www.babbel.com', label: 'Babbel' },
            { url: 'https://www.busuu.com', label: 'Busuu' },
          ]},
          { id: 'education-vocational', name: 'Vocational & Trade', seeds: [
            { url: 'https://www.apprenticeship.gov', label: 'Apprenticeship.gov' },
            { url: 'https://www.masterclass.com', label: 'MasterClass' },
          ]},
        ],
      },
      {
        id: 'science', name: 'Science & Research', icon: 'cpu',
        desc: 'Scientific papers, journals, and research databases',
        subcategories: [
          { id: 'science-physics', name: 'Physics', seeds: [
            { url: 'https://arxiv.org', label: 'arXiv' },
            { url: 'https://www.aps.org', label: 'APS Physics' },
            { url: 'https://home.cern', label: 'CERN' },
          ]},
          { id: 'science-biology', name: 'Biology', seeds: [
            { url: 'https://pubmed.ncbi.nlm.nih.gov', label: 'PubMed' },
            { url: 'https://www.nature.com', label: 'Nature' },
            { url: 'https://www.science.org', label: 'Science' },
          ]},
          { id: 'science-chemistry', name: 'Chemistry', seeds: [
            { url: 'https://www.acs.org', label: 'ACS' },
            { url: 'https://www.rsc.org', label: 'Royal Society of Chemistry' },
          ]},
          { id: 'science-math', name: 'Mathematics', seeds: [
            { url: 'https://mathworld.wolfram.com', label: 'MathWorld' },
            { url: 'https://www.ams.org', label: 'AMS' },
            { url: 'https://math.stackexchange.com', label: 'Math StackExchange' },
          ]},
          { id: 'science-earth', name: 'Earth Science', seeds: [
            { url: 'https://www.nasa.gov', label: 'NASA' },
            { url: 'https://www.scientificamerican.com', label: 'Scientific American' },
            { url: 'https://www.usgs.gov', label: 'USGS' },
          ]},
          { id: 'science-astronomy', name: 'Astronomy', seeds: [
            { url: 'https://www.space.com', label: 'Space.com' },
            { url: 'https://www.esa.int', label: 'ESA' },
            { url: 'https://hubblesite.org', label: 'Hubble' },
            { url: 'https://www.skyandtelescope.org', label: 'Sky & Telescope' },
            { url: 'https://astronomy.com', label: 'Astronomy Magazine' },
          ]},
          { id: 'science-space', name: 'Space Exploration', seeds: [
            { url: 'https://www.nasa.gov', label: 'NASA' },
            { url: 'https://www.spacex.com', label: 'SpaceX' },
            { url: 'https://www.jwst.nasa.gov', label: 'James Webb Telescope' },
            { url: 'https://spacenews.com', label: 'SpaceNews' },
            { url: 'https://www.planetary.org', label: 'Planetary Society' },
            { url: 'https://arstechnica.com/space', label: 'Ars Technica Space' },
          ]},
          { id: 'science-astrobiology', name: 'Astrobiology & SETI', seeds: [
            { url: 'https://astrobiology.nasa.gov', label: 'NASA Astrobiology' },
            { url: 'https://www.seti.org', label: 'SETI Institute' },
          ]},
          { id: 'science-neuro', name: 'Neuroscience', seeds: [
            { url: 'https://www.jneurosci.org', label: 'J. Neuroscience' },
            { url: 'https://www.brainfacts.org', label: 'BrainFacts' },
          ]},
        ],
      },
      {
        id: 'news', name: 'News & Journalism', icon: 'megaphone',
        desc: 'World news, investigative reporting, and current events',
        subcategories: [
          { id: 'news-world', name: 'World News', seeds: [
            { url: 'https://www.reuters.com', label: 'Reuters' },
            { url: 'https://apnews.com', label: 'AP News' },
            { url: 'https://www.bbc.com/news', label: 'BBC News' },
          ]},
          { id: 'news-tech', name: 'Tech News', seeds: [
            { url: 'https://www.theverge.com', label: 'The Verge' },
            { url: 'https://arstechnica.com', label: 'Ars Technica' },
            { url: 'https://www.wired.com', label: 'Wired' },
          ]},
          { id: 'news-business', name: 'Business', seeds: [
            { url: 'https://www.ft.com', label: 'Financial Times' },
            { url: 'https://www.bloomberg.com', label: 'Bloomberg' },
          ]},
          { id: 'news-investigative', name: 'Investigative', seeds: [
            { url: 'https://www.theguardian.com', label: 'The Guardian' },
            { url: 'https://www.npr.org', label: 'NPR' },
            { url: 'https://www.aljazeera.com', label: 'Al Jazeera' },
          ]},
          { id: 'news-science', name: 'Science News', seeds: [
            { url: 'https://www.newscientist.com', label: 'New Scientist' },
            { url: 'https://www.livescience.com', label: 'Live Science' },
          ]},
          { id: 'news-local', name: 'Local & Regional', seeds: [
            { url: 'https://www.patch.com', label: 'Patch' },
            { url: 'https://www.propublica.org', label: 'ProPublica' },
          ]},
        ],
      },
      {
        id: 'history', name: 'History & Culture', icon: 'globe',
        desc: 'Museums, archives, cultural heritage, and world history',
        subcategories: [
          { id: 'history-ancient', name: 'Ancient', seeds: [
            { url: 'https://www.britishmuseum.org', label: 'British Museum' },
            { url: 'https://www.metmuseum.org', label: 'Met Museum' },
            { url: 'https://www.history.com', label: 'History.com' },
          ]},
          { id: 'history-modern', name: 'Modern', seeds: [
            { url: 'https://www.smithsonianmag.com', label: 'Smithsonian' },
            { url: 'https://www.loc.gov', label: 'Library of Congress' },
          ]},
          { id: 'history-heritage', name: 'Cultural Heritage', seeds: [
            { url: 'https://whc.unesco.org', label: 'UNESCO World Heritage' },
            { url: 'https://archive.org', label: 'Internet Archive' },
          ]},
          { id: 'history-medieval', name: 'Medieval', seeds: [
            { url: 'https://www.medievalists.net', label: 'Medievalists.net' },
            { url: 'https://www.themorgan.org', label: 'Morgan Library' },
          ]},
          { id: 'history-archaeology', name: 'Archaeology', seeds: [
            { url: 'https://www.archaeology.org', label: 'Archaeology Magazine' },
            { url: 'https://www.worldarchaeology.com', label: 'World Archaeology' },
          ]},
        ],
      },
      {
        id: 'philosophy', name: 'Philosophy & Ethics', icon: 'fileText',
        desc: 'Philosophy, logic, ethics, and critical thinking',
        subcategories: [
          { id: 'philosophy-general', name: 'General', seeds: [
            { url: 'https://plato.stanford.edu', label: 'Stanford Encyclopedia' },
            { url: 'https://www.iep.utm.edu', label: 'Internet Encyclopedia of Philosophy' },
          ]},
          { id: 'philosophy-ethics', name: 'Ethics & Morality', seeds: [
            { url: 'https://ethics.org.au', label: 'Ethics Centre' },
            { url: 'https://www.bbc.co.uk/ethics', label: 'BBC Ethics' },
          ]},
          { id: 'philosophy-logic', name: 'Logic & Reasoning', seeds: [
            { url: 'https://www.logicmatters.net', label: 'Logic Matters' },
            { url: 'https://www.fallacyfiles.org', label: 'Fallacy Files' },
          ]},
        ],
      },
      {
        id: 'law', name: 'Law & Government', icon: 'fileText',
        desc: 'Legal resources, government data, and civic information',
        subcategories: [
          { id: 'law-legal', name: 'Legal Resources', seeds: [
            { url: 'https://www.law.cornell.edu', label: 'Cornell LII' },
            { url: 'https://www.justia.com', label: 'Justia' },
          ]},
          { id: 'law-government', name: 'Government', seeds: [
            { url: 'https://www.usa.gov', label: 'USA.gov' },
            { url: 'https://www.gov.uk', label: 'GOV.UK' },
            { url: 'https://www.data.gov', label: 'Data.gov' },
          ]},
          { id: 'law-rights', name: 'Civil Rights', seeds: [
            { url: 'https://www.aclu.org', label: 'ACLU' },
            { url: 'https://www.eff.org', label: 'EFF' },
            { url: 'https://www.amnesty.org', label: 'Amnesty International' },
          ]},
          { id: 'law-intl', name: 'International Law', seeds: [
            { url: 'https://www.icj-cij.org', label: 'ICJ' },
            { url: 'https://www.un.org/en/about-us/universal-declaration-of-human-rights', label: 'UN Human Rights' },
          ]},
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════
  // GROUP 2: Lifestyle & Wellbeing
  // ══════════════════════════════════════════════════════
  {
    id: 'lifestyle', name: 'Lifestyle & Wellbeing', icon: 'heart',
    categories: [
      {
        id: 'health', name: 'Health & Medicine', icon: 'heart',
        desc: 'Medical information, wellness guides, and health research',
        subcategories: [
          { id: 'health-medical', name: 'Medical', seeds: [
            { url: 'https://www.who.int', label: 'WHO' },
            { url: 'https://www.mayoclinic.org', label: 'Mayo Clinic' },
            { url: 'https://www.nih.gov', label: 'NIH' },
          ]},
          { id: 'health-fitness', name: 'Fitness', seeds: [
            { url: 'https://www.healthline.com', label: 'Healthline' },
            { url: 'https://www.runnersworld.com', label: "Runner's World" },
            { url: 'https://www.bodybuilding.com', label: 'Bodybuilding.com' },
          ]},
          { id: 'health-mental', name: 'Mental Health', seeds: [
            { url: 'https://www.nimh.nih.gov', label: 'NIMH' },
            { url: 'https://www.psychologytoday.com', label: 'Psychology Today' },
            { url: 'https://www.headspace.com', label: 'Headspace' },
          ]},
          { id: 'health-nutrition', name: 'Nutrition', seeds: [
            { url: 'https://www.webmd.com', label: 'WebMD' },
            { url: 'https://medlineplus.gov', label: 'MedlinePlus' },
            { url: 'https://examine.com', label: 'Examine' },
          ]},
          { id: 'health-yoga', name: 'Yoga & Meditation', seeds: [
            { url: 'https://www.yogajournal.com', label: 'Yoga Journal' },
            { url: 'https://www.calm.com', label: 'Calm' },
          ]},
          { id: 'health-alt', name: 'Alternative Medicine', seeds: [
            { url: 'https://nccih.nih.gov', label: 'NCCIH' },
            { url: 'https://www.herbalgram.org', label: 'HerbalGram' },
          ]},
        ],
      },
      {
        id: 'food', name: 'Food & Cooking', icon: 'coffee',
        desc: 'Recipes, cooking techniques, and food culture',
        subcategories: [
          { id: 'food-recipes', name: 'Recipes', seeds: [
            { url: 'https://www.allrecipes.com', label: 'AllRecipes' },
            { url: 'https://www.seriouseats.com', label: 'Serious Eats' },
            { url: 'https://www.simplyrecipes.com', label: 'Simply Recipes' },
          ]},
          { id: 'food-restaurant', name: 'Restaurant & Reviews', seeds: [
            { url: 'https://www.bonappetit.com', label: 'Bon Appétit' },
            { url: 'https://www.epicurious.com', label: 'Epicurious' },
          ]},
          { id: 'food-science', name: 'Food Science', seeds: [
            { url: 'https://www.bbcgoodfood.com', label: 'BBC Good Food' },
            { url: 'https://www.foodnetwork.com', label: 'Food Network' },
          ]},
          { id: 'food-baking', name: 'Baking & Pastry', seeds: [
            { url: 'https://www.kingarthurbaking.com', label: 'King Arthur Baking' },
            { url: 'https://sallysbakingaddiction.com', label: "Sally's Baking" },
          ]},
          { id: 'food-vegan', name: 'Vegan & Plant-Based', seeds: [
            { url: 'https://minimalistbaker.com', label: 'Minimalist Baker' },
            { url: 'https://www.theppk.com', label: 'Post Punk Kitchen' },
          ]},
          { id: 'food-drinks', name: 'Drinks & Cocktails', seeds: [
            { url: 'https://www.liquor.com', label: 'Liquor.com' },
            { url: 'https://punchdrink.com', label: 'PUNCH' },
            { url: 'https://www.winemag.com', label: 'Wine Enthusiast' },
          ]},
          { id: 'food-world', name: 'World Cuisines', seeds: [
            { url: 'https://www.justonecookbook.com', label: 'Just One Cookbook' },
            { url: 'https://www.196flavors.com', label: '196 Flavors' },
            { url: 'https://www.maangchi.com', label: 'Maangchi' },
          ]},
        ],
      },
      {
        id: 'sports', name: 'Sports & Fitness', icon: 'trendingUp',
        desc: 'Sports news, fitness guides, and athletic training',
        subcategories: [
          { id: 'sports-team', name: 'Team Sports', seeds: [
            { url: 'https://www.espn.com', label: 'ESPN' },
            { url: 'https://www.nba.com', label: 'NBA' },
            { url: 'https://www.fifa.com', label: 'FIFA' },
          ]},
          { id: 'sports-individual', name: 'Individual Sports', seeds: [
            { url: 'https://olympics.com', label: 'Olympics' },
            { url: 'https://www.bbc.com/sport', label: 'BBC Sport' },
          ]},
          { id: 'sports-esports', name: 'Esports', seeds: [
            { url: 'https://www.hltv.org', label: 'HLTV' },
            { url: 'https://liquipedia.net', label: 'Liquipedia' },
          ]},
          { id: 'sports-outdoor', name: 'Outdoor & Adventure', seeds: [
            { url: 'https://www.outsideonline.com', label: 'Outside' },
            { url: 'https://www.rei.com/learn', label: 'REI Learn' },
          ]},
          { id: 'sports-combat', name: 'Combat & Martial Arts', seeds: [
            { url: 'https://www.ufc.com', label: 'UFC' },
            { url: 'https://www.sherdog.com', label: 'Sherdog' },
          ]},
          { id: 'sports-cycling', name: 'Cycling', seeds: [
            { url: 'https://www.cyclingnews.com', label: 'CyclingNews' },
            { url: 'https://www.bikeradar.com', label: 'BikeRadar' },
          ]},
          { id: 'sports-water', name: 'Water Sports', seeds: [
            { url: 'https://www.surfer.com', label: 'Surfer' },
            { url: 'https://www.swimmingworldmagazine.com', label: 'Swimming World' },
          ]},
          { id: 'sports-sailing', name: 'Sailing', seeds: [
            { url: 'https://www.sailingworld.com', label: 'Sailing World' },
            { url: 'https://www.yachtingworld.com', label: 'Yachting World' },
            { url: 'https://www.sailmagazine.com', label: 'SAIL Magazine' },
            { url: 'https://www.cruisingworld.com', label: 'Cruising World' },
            { url: 'https://www.practical-sailor.com', label: 'Practical Sailor' },
          ]},
          { id: 'sports-winter', name: 'Winter Sports', seeds: [
            { url: 'https://www.skimagazine.com', label: 'SKI Magazine' },
            { url: 'https://snowbrains.com', label: 'SnowBrains' },
          ]},
        ],
      },
      {
        id: 'travel', name: 'Travel & Geography', icon: 'mapPin',
        desc: 'Travel guides, destinations, and geographic exploration',
        subcategories: [
          { id: 'travel-destinations', name: 'Destinations', seeds: [
            { url: 'https://www.lonelyplanet.com', label: 'Lonely Planet' },
            { url: 'https://www.nationalgeographic.com', label: 'Nat Geo' },
            { url: 'https://www.tripadvisor.com', label: 'TripAdvisor' },
          ]},
          { id: 'travel-backpacking', name: 'Backpacking', seeds: [
            { url: 'https://www.worldnomads.com', label: 'World Nomads' },
            { url: 'https://www.atlasobscura.com', label: 'Atlas Obscura' },
          ]},
          { id: 'travel-tech', name: 'Travel Tech', seeds: [
            { url: 'https://wikitravel.org', label: 'Wikitravel' },
            { url: 'https://www.rome2rio.com', label: 'Rome2Rio' },
          ]},
          { id: 'travel-digital-nomad', name: 'Digital Nomad', seeds: [
            { url: 'https://nomadlist.com', label: 'Nomad List' },
            { url: 'https://www.nomadicmatt.com', label: 'Nomadic Matt' },
          ]},
          { id: 'travel-road', name: 'Road Trips & Van Life', seeds: [
            { url: 'https://www.roadtrippers.com', label: 'Roadtrippers' },
            { url: 'https://www.campendium.com', label: 'Campendium' },
          ]},
        ],
      },
      {
        id: 'fashion', name: 'Fashion & Style', icon: 'heart',
        desc: 'Fashion trends, streetwear, sustainable fashion, and style guides',
        subcategories: [
          { id: 'fashion-trends', name: 'Trends & News', seeds: [
            { url: 'https://www.vogue.com', label: 'Vogue' },
            { url: 'https://www.gq.com', label: 'GQ' },
            { url: 'https://hypebeast.com', label: 'Hypebeast' },
          ]},
          { id: 'fashion-street', name: 'Streetwear', seeds: [
            { url: 'https://www.highsnobiety.com', label: 'Highsnobiety' },
            { url: 'https://www.complex.com/style', label: 'Complex Style' },
          ]},
          { id: 'fashion-sustainable', name: 'Sustainable Fashion', seeds: [
            { url: 'https://goodonyou.eco', label: 'Good On You' },
            { url: 'https://www.thegoodtrade.com', label: 'The Good Trade' },
          ]},
          { id: 'fashion-luxury', name: 'Luxury & High Fashion', seeds: [
            { url: 'https://www.businessoffashion.com', label: 'Business of Fashion' },
            { url: 'https://www.harpersbazaar.com', label: "Harper's Bazaar" },
          ]},
        ],
      },
      {
        id: 'home', name: 'Home & Interior', icon: 'heart',
        desc: 'Interior design, home improvement, and real estate',
        subcategories: [
          { id: 'home-interior', name: 'Interior Design', seeds: [
            { url: 'https://www.architecturaldigest.com', label: 'Architectural Digest' },
            { url: 'https://www.apartmenttherapy.com', label: 'Apartment Therapy' },
          ]},
          { id: 'home-diy', name: 'Home Improvement', seeds: [
            { url: 'https://www.thisoldhouse.com', label: 'This Old House' },
            { url: 'https://www.familyhandyman.com', label: 'Family Handyman' },
          ]},
          { id: 'home-realestate', name: 'Real Estate', seeds: [
            { url: 'https://www.zillow.com', label: 'Zillow' },
            { url: 'https://www.realtor.com', label: 'Realtor.com' },
          ]},
          { id: 'home-organize', name: 'Organization & Minimalism', seeds: [
            { url: 'https://www.theminimalists.com', label: 'The Minimalists' },
            { url: 'https://www.becomingminimalist.com', label: 'Becoming Minimalist' },
          ]},
        ],
      },
      {
        id: 'gardening', name: 'Gardening', icon: 'heart',
        desc: 'Vegetable gardens, houseplants, permaculture, and landscaping',
        subcategories: [
          { id: 'gardening-general', name: 'General Gardening', seeds: [
            { url: 'https://www.gardeningknowhow.com', label: 'Gardening Know How' },
            { url: 'https://www.rhs.org.uk', label: 'RHS' },
            { url: 'https://savvygardening.com', label: 'Savvy Gardening' },
          ]},
          { id: 'gardening-veggie', name: 'Vegetable & Edible', seeds: [
            { url: 'https://www.growveg.com', label: 'GrowVeg' },
            { url: 'https://www.gardenersworld.com', label: "Gardeners' World" },
            { url: 'https://www.epicgardening.com', label: 'Epic Gardening' },
          ]},
          { id: 'gardening-houseplants', name: 'Houseplants', seeds: [
            { url: 'https://www.thespruce.com/houseplants-4127735', label: 'The Spruce Houseplants' },
            { url: 'https://www.houseplantjournal.com', label: 'Houseplant Journal' },
          ]},
          { id: 'gardening-permaculture', name: 'Permaculture', seeds: [
            { url: 'https://www.permaculturenews.org', label: 'Permaculture News' },
            { url: 'https://www.permaculture.org', label: 'Permaculture Institute' },
          ]},
          { id: 'gardening-landscape', name: 'Landscaping', seeds: [
            { url: 'https://www.gardendesign.com', label: 'Garden Design' },
            { url: 'https://www.bhg.com/gardening', label: 'BHG Gardening' },
          ]},
          { id: 'gardening-hydroponics', name: 'Hydroponics & Indoor', seeds: [
            { url: 'https://www.maximumyield.com', label: 'Maximum Yield' },
            { url: 'https://generalhydroponics.com', label: 'General Hydroponics' },
          ]},
        ],
      },
      {
        id: 'parenting', name: 'Parenting & Family', icon: 'heart',
        desc: 'Parenting advice, child development, and family life',
        subcategories: [
          { id: 'parenting-baby', name: 'Baby & Toddler', seeds: [
            { url: 'https://www.whattoexpect.com', label: 'What to Expect' },
            { url: 'https://www.babycenter.com', label: 'BabyCenter' },
          ]},
          { id: 'parenting-kids', name: 'Kids & Teens', seeds: [
            { url: 'https://www.commonsensemedia.org', label: 'Common Sense Media' },
            { url: 'https://www.parents.com', label: 'Parents.com' },
          ]},
          { id: 'parenting-education', name: 'Homeschooling', seeds: [
            { url: 'https://www.time4learning.com', label: 'Time4Learning' },
            { url: 'https://www.homeschool.com', label: 'Homeschool.com' },
          ]},
        ],
      },
      {
        id: 'pets', name: 'Pets & Animals', icon: 'heart',
        desc: 'Pet care, animal behavior, veterinary resources, and wildlife',
        subcategories: [
          { id: 'pets-dogs', name: 'Dogs', seeds: [
            { url: 'https://www.akc.org', label: 'AKC' },
            { url: 'https://www.whole-dog-journal.com', label: 'Whole Dog Journal' },
          ]},
          { id: 'pets-cats', name: 'Cats', seeds: [
            { url: 'https://www.catster.com', label: 'Catster' },
            { url: 'https://icatcare.org', label: 'iCatCare' },
          ]},
          { id: 'pets-exotic', name: 'Exotic & Aquarium', seeds: [
            { url: 'https://www.thesprucepets.com', label: 'The Spruce Pets' },
            { url: 'https://www.fishkeepingworld.com', label: 'Fishkeeping World' },
          ]},
          { id: 'pets-wildlife', name: 'Wildlife & Conservation', seeds: [
            { url: 'https://www.worldwildlife.org', label: 'WWF' },
            { url: 'https://www.audubon.org', label: 'Audubon Society' },
          ]},
        ],
      },
      {
        id: 'gambling', name: 'Gambling & Betting', icon: 'trendingUp',
        desc: 'Poker strategy, sports betting, casino games, and odds analysis',
        subcategories: [
          { id: 'gambling-poker', name: 'Poker', seeds: [
            { url: 'https://www.pokernews.com', label: 'PokerNews' },
            { url: 'https://www.pokerstrategy.com', label: 'PokerStrategy' },
            { url: 'https://forumserver.twoplustwo.com', label: 'TwoPlusTwo' },
          ]},
          { id: 'gambling-sports', name: 'Sports Betting', seeds: [
            { url: 'https://www.actionnetwork.com', label: 'Action Network' },
            { url: 'https://www.covers.com', label: 'Covers' },
            { url: 'https://www.oddsportal.com', label: 'OddsPortal' },
          ]},
          { id: 'gambling-casino', name: 'Casino & Table Games', seeds: [
            { url: 'https://wizardofodds.com', label: 'Wizard of Odds' },
            { url: 'https://www.blackjackapprenticeship.com', label: 'Blackjack Apprenticeship' },
          ]},
          { id: 'gambling-fantasy', name: 'Fantasy & DFS', seeds: [
            { url: 'https://www.fantasypros.com', label: 'FantasyPros' },
            { url: 'https://www.rotowire.com', label: 'RotoWire' },
          ]},
          { id: 'gambling-odds', name: 'Odds & Analytics', seeds: [
            { url: 'https://www.fivethirtyeight.com', label: 'FiveThirtyEight' },
            { url: 'https://www.pinnacle.com/en/betting-resources', label: 'Pinnacle Resources' },
          ]},
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════
  // GROUP 3: Creative & Entertainment
  // ══════════════════════════════════════════════════════
  {
    id: 'creative', name: 'Creative & Entertainment', icon: 'monitor',
    categories: [
      {
        id: 'arts', name: 'Arts & Design', icon: 'image',
        desc: 'Visual arts, graphic design, illustration, and museums',
        subcategories: [
          { id: 'arts-visual', name: 'Visual Arts', seeds: [
            { url: 'https://www.moma.org', label: 'MoMA' },
            { url: 'https://www.artsy.net', label: 'Artsy' },
            { url: 'https://www.metmuseum.org', label: 'Met Museum' },
          ]},
          { id: 'arts-photography', name: 'Photography', seeds: [
            { url: 'https://www.deviantart.com', label: 'DeviantArt' },
            { url: 'https://500px.com', label: '500px' },
            { url: 'https://petapixel.com', label: 'PetaPixel' },
          ]},
          { id: 'arts-design', name: 'Graphic Design', seeds: [
            { url: 'https://www.behance.net', label: 'Behance' },
            { url: 'https://dribbble.com', label: 'Dribbble' },
          ]},
          { id: 'arts-ux', name: 'UX & Product Design', seeds: [
            { url: 'https://www.nngroup.com', label: 'Nielsen Norman' },
            { url: 'https://uxdesign.cc', label: 'UX Collective' },
          ]},
          { id: 'arts-3d', name: '3D Art & CGI', seeds: [
            { url: 'https://www.artstation.com', label: 'ArtStation' },
            { url: 'https://www.blender.org', label: 'Blender' },
          ]},
          { id: 'arts-architecture', name: 'Architecture', seeds: [
            { url: 'https://www.archdaily.com', label: 'ArchDaily' },
            { url: 'https://www.dezeen.com', label: 'Dezeen' },
          ]},
        ],
      },
      {
        id: 'film', name: 'Film & Television', icon: 'monitor',
        desc: 'Movies, TV shows, directors, and cinema history',
        subcategories: [
          { id: 'film-reviews', name: 'Reviews & Ratings', seeds: [
            { url: 'https://www.imdb.com', label: 'IMDb' },
            { url: 'https://letterboxd.com', label: 'Letterboxd' },
            { url: 'https://www.rottentomatoes.com', label: 'Rotten Tomatoes' },
          ]},
          { id: 'film-indie', name: 'Independent Film', seeds: [
            { url: 'https://www.indiewire.com', label: 'IndieWire' },
            { url: 'https://mubi.com', label: 'MUBI' },
          ]},
          { id: 'film-tv', name: 'Television', seeds: [
            { url: 'https://www.tvguide.com', label: 'TV Guide' },
            { url: 'https://deadline.com', label: 'Deadline' },
          ]},
          { id: 'film-making', name: 'Filmmaking', seeds: [
            { url: 'https://nofilmschool.com', label: 'No Film School' },
            { url: 'https://www.studiobinder.com', label: 'StudioBinder' },
          ]},
          { id: 'film-animation', name: 'Animation', seeds: [
            { url: 'https://www.cartoonbrew.com', label: 'Cartoon Brew' },
            { url: 'https://www.animationmagazine.net', label: 'Animation Magazine' },
          ]},
        ],
      },
      {
        id: 'music', name: 'Music', icon: 'music',
        desc: 'Music discovery, streaming, theory, and production',
        subcategories: [
          { id: 'music-streaming', name: 'Streaming & Discovery', seeds: [
            { url: 'https://bandcamp.com', label: 'Bandcamp' },
            { url: 'https://soundcloud.com', label: 'SoundCloud' },
          ]},
          { id: 'music-theory', name: 'Theory', seeds: [
            { url: 'https://www.musictheory.net', label: 'MusicTheory.net' },
            { url: 'https://www.hooktheory.com', label: 'Hooktheory' },
          ]},
          { id: 'music-production', name: 'Production', seeds: [
            { url: 'https://www.soundonsound.com', label: 'Sound On Sound' },
            { url: 'https://www.gearslutz.com', label: 'Gearspace' },
          ]},
          { id: 'music-news', name: 'News & Reviews', seeds: [
            { url: 'https://pitchfork.com', label: 'Pitchfork' },
            { url: 'https://www.rollingstone.com', label: 'Rolling Stone' },
            { url: 'https://www.discogs.com', label: 'Discogs' },
          ]},
          { id: 'music-genres', name: 'Genre Communities', seeds: [
            { url: 'https://www.residentadvisor.net', label: 'Resident Advisor' },
            { url: 'https://daily.bandcamp.com', label: 'Bandcamp Daily' },
          ]},
          { id: 'music-instruments', name: 'Instruments & Tabs', seeds: [
            { url: 'https://www.ultimate-guitar.com', label: 'Ultimate Guitar' },
            { url: 'https://www.pianistmagazine.com', label: 'Pianist Magazine' },
          ]},
        ],
      },
      {
        id: 'books', name: 'Books & Literature', icon: 'bookOpen',
        desc: 'Book reviews, literary archives, and digital libraries',
        subcategories: [
          { id: 'books-reviews', name: 'Reviews', seeds: [
            { url: 'https://www.goodreads.com', label: 'Goodreads' },
            { url: 'https://lithub.com', label: 'Literary Hub' },
          ]},
          { id: 'books-authors', name: 'Authors & Poetry', seeds: [
            { url: 'https://www.poetryfoundation.org', label: 'Poetry Foundation' },
            { url: 'https://www.penguinrandomhouse.com', label: 'Penguin Random House' },
          ]},
          { id: 'books-libraries', name: 'Libraries', seeds: [
            { url: 'https://openlibrary.org', label: 'Open Library' },
            { url: 'https://www.gutenberg.org', label: 'Project Gutenberg' },
            { url: 'https://www.loc.gov', label: 'Library of Congress' },
          ]},
          { id: 'books-scifi', name: 'Science Fiction', seeds: [
            { url: 'https://www.tor.com', label: 'Tor.com' },
            { url: 'https://locusmag.com', label: 'Locus Magazine' },
            { url: 'https://www.sfsite.com', label: 'SF Site' },
            { url: 'https://www.clarkesworld.com', label: 'Clarkesworld' },
          ]},
          { id: 'books-fantasy', name: 'Fantasy', seeds: [
            { url: 'https://www.fantasy-faction.com', label: 'Fantasy Faction' },
            { url: 'https://thefantasyinn.com', label: 'The Fantasy Inn' },
            { url: 'https://www.grimdarkmagazine.com', label: 'Grimdark Magazine' },
            { url: 'https://www.orbitbooks.net', label: 'Orbit Books' },
          ]},
          { id: 'books-horror', name: 'Horror', seeds: [
            { url: 'https://www.nightmare-magazine.com', label: 'Nightmare Magazine' },
            { url: 'https://www.horrorwriters.org', label: 'Horror Writers Association' },
          ]},
          { id: 'books-comics', name: 'Comics & Graphic Novels', seeds: [
            { url: 'https://www.comicbookresources.com', label: 'CBR' },
            { url: 'https://imagecomics.com', label: 'Image Comics' },
            { url: 'https://www.webtoons.com', label: 'Webtoons' },
          ]},
        ],
      },
      {
        id: 'gaming', name: 'Gaming', icon: 'monitor',
        desc: 'Game reviews, industry news, and gaming communities',
        subcategories: [
          { id: 'gaming-pc', name: 'PC', seeds: [
            { url: 'https://store.steampowered.com', label: 'Steam' },
            { url: 'https://www.pcgamer.com', label: 'PC Gamer' },
          ]},
          { id: 'gaming-console', name: 'Console', seeds: [
            { url: 'https://www.ign.com', label: 'IGN' },
            { url: 'https://www.gamespot.com', label: 'GameSpot' },
          ]},
          { id: 'gaming-indie', name: 'Indie', seeds: [
            { url: 'https://itch.io', label: 'itch.io' },
            { url: 'https://www.polygon.com', label: 'Polygon' },
          ]},
          { id: 'gaming-dev', name: 'Game Dev', seeds: [
            { url: 'https://www.gamedeveloper.com', label: 'Game Developer' },
            { url: 'https://unity.com', label: 'Unity' },
            { url: 'https://godotengine.org', label: 'Godot' },
          ]},
          { id: 'gaming-retro', name: 'Retro Gaming', seeds: [
            { url: 'https://www.retrorgb.com', label: 'RetroRGB' },
            { url: 'https://www.racketboy.com', label: 'Racketboy' },
          ]},
          { id: 'gaming-tabletop', name: 'Board Games', seeds: [
            { url: 'https://boardgamegeek.com', label: 'BoardGameGeek' },
            { url: 'https://www.dicebreaker.com', label: 'Dicebreaker' },
            { url: 'https://www.shutupandsitdown.com', label: 'Shut Up & Sit Down' },
          ]},
          { id: 'gaming-ttrpg', name: 'Tabletop RPGs', seeds: [
            { url: 'https://www.dndbeyond.com', label: 'D&D Beyond' },
            { url: 'https://paizo.com', label: 'Paizo (Pathfinder)' },
            { url: 'https://www.chaosium.com', label: 'Chaosium (Call of Cthulhu)' },
            { url: 'https://www.gmbinder.com', label: 'GM Binder' },
          ]},
          { id: 'gaming-miniatures', name: 'Miniatures & Wargaming', seeds: [
            { url: 'https://www.warhammer-community.com', label: 'Warhammer Community' },
            { url: 'https://www.beastsofwar.com', label: 'Beasts of War' },
          ]},
          { id: 'gaming-puzzles', name: 'Puzzles & Strategy', seeds: [
            { url: 'https://www.chess.com', label: 'Chess.com' },
            { url: 'https://lichess.org', label: 'Lichess' },
          ]},
        ],
      },
      {
        id: 'anime', name: 'Anime & Manga', icon: 'monitor',
        desc: 'Anime series, manga, light novels, and Japanese pop culture',
        subcategories: [
          { id: 'anime-tracking', name: 'Tracking & Discovery', seeds: [
            { url: 'https://myanimelist.net', label: 'MyAnimeList' },
            { url: 'https://anilist.co', label: 'AniList' },
            { url: 'https://kitsu.app', label: 'Kitsu' },
          ]},
          { id: 'anime-news', name: 'News & Reviews', seeds: [
            { url: 'https://www.animenewsnetwork.com', label: 'Anime News Network' },
            { url: 'https://www.cbr.com/category/anime', label: 'CBR Anime' },
          ]},
          { id: 'anime-manga', name: 'Manga', seeds: [
            { url: 'https://www.mangaupdates.com', label: 'Manga Updates' },
            { url: 'https://mangadex.org', label: 'MangaDex' },
          ]},
          { id: 'anime-lightnovel', name: 'Light Novels', seeds: [
            { url: 'https://www.novelupdates.com', label: 'Novel Updates' },
            { url: 'https://j-novel.club', label: 'J-Novel Club' },
          ]},
        ],
      },
      {
        id: 'scifi-culture', name: 'Sci-Fi & Futurism', icon: 'cpu',
        desc: 'Science fiction culture, futurism, transhumanism, and speculative tech',
        subcategories: [
          { id: 'scifi-fiction', name: 'Sci-Fi Media', seeds: [
            { url: 'https://www.den-of-geek.com', label: 'Den of Geek' },
            { url: 'https://io9.gizmodo.com', label: 'io9' },
            { url: 'https://www.syfy.com/syfy-wire', label: 'SYFY Wire' },
          ]},
          { id: 'scifi-futurism', name: 'Futurism & Singularity', seeds: [
            { url: 'https://futurism.com', label: 'Futurism' },
            { url: 'https://singularityhub.com', label: 'Singularity Hub' },
            { url: 'https://www.kurzweilai.net', label: 'Kurzweil AI' },
          ]},
          { id: 'scifi-transhumanism', name: 'Transhumanism', seeds: [
            { url: 'https://humanityplus.org', label: 'Humanity+' },
            { url: 'https://www.nickbostrom.com', label: 'Nick Bostrom' },
          ]},
          { id: 'scifi-space-culture', name: 'Space Culture', seeds: [
            { url: 'https://www.universetoday.com', label: 'Universe Today' },
            { url: 'https://www.space.com', label: 'Space.com' },
            { url: 'https://everydayastronaut.com', label: 'Everyday Astronaut' },
          ]},
        ],
      },
      {
        id: 'podcasts', name: 'Podcasts & Audio', icon: 'music',
        desc: 'Podcasts, audiobooks, and audio storytelling',
        subcategories: [
          { id: 'podcasts-directories', name: 'Directories', seeds: [
            { url: 'https://podcastindex.org', label: 'Podcast Index' },
            { url: 'https://www.listennotes.com', label: 'Listen Notes' },
          ]},
          { id: 'podcasts-true-crime', name: 'True Crime', seeds: [
            { url: 'https://www.thecrimson.com', label: 'True Crime Podcasts' },
            { url: 'https://crimejunkie.com', label: 'Crime Junkie' },
          ]},
          { id: 'podcasts-comedy', name: 'Comedy', seeds: [
            { url: 'https://www.earwolf.com', label: 'Earwolf' },
            { url: 'https://maximumfun.org', label: 'Maximum Fun' },
          ]},
        ],
      },
      {
        id: 'writing', name: 'Writing & Storytelling', icon: 'fileText',
        desc: 'Creative writing, screenwriting, journalism, and publishing',
        subcategories: [
          { id: 'writing-creative', name: 'Creative Writing', seeds: [
            { url: 'https://www.writersdigest.com', label: "Writer's Digest" },
            { url: 'https://www.nanowrimo.org', label: 'NaNoWriMo' },
          ]},
          { id: 'writing-journalism', name: 'Journalism', seeds: [
            { url: 'https://www.cjr.org', label: 'Columbia Journalism Review' },
            { url: 'https://www.niemanlab.org', label: 'Nieman Lab' },
          ]},
          { id: 'writing-screenwriting', name: 'Screenwriting', seeds: [
            { url: 'https://www.scriptmag.com', label: 'Script Magazine' },
            { url: 'https://johnaugust.com', label: 'John August' },
          ]},
          { id: 'writing-selfpub', name: 'Self-Publishing', seeds: [
            { url: 'https://www.lulu.com', label: 'Lulu' },
            { url: 'https://selfpublishingadvice.org', label: 'Self-Publishing Advice' },
          ]},
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════
  // GROUP 4: Technology & Development
  // ══════════════════════════════════════════════════════
  {
    id: 'technology', name: 'Technology & Development', icon: 'code',
    categories: [
      {
        id: 'tech', name: 'Programming', icon: 'code',
        desc: 'Language docs, tutorials, and developer resources',
        subcategories: [
          { id: 'tech-aiml', name: 'AI / ML Frameworks', seeds: [
            { url: 'https://huggingface.co', label: 'Hugging Face' },
            { url: 'https://pytorch.org', label: 'PyTorch' },
            { url: 'https://www.tensorflow.org', label: 'TensorFlow' },
            { url: 'https://jax.readthedocs.io', label: 'JAX' },
          ]},
          { id: 'tech-llm', name: 'LLMs & Generative AI', seeds: [
            { url: 'https://openai.com/research', label: 'OpenAI Research' },
            { url: 'https://www.anthropic.com', label: 'Anthropic' },
            { url: 'https://ai.meta.com', label: 'Meta AI' },
            { url: 'https://www.deepmind.com', label: 'DeepMind' },
            { url: 'https://ollama.com', label: 'Ollama' },
            { url: 'https://lmsys.org', label: 'LMSYS' },
          ]},
          { id: 'tech-ai-news', name: 'AI News & Community', seeds: [
            { url: 'https://arxiv.org/list/cs.AI/recent', label: 'arXiv AI' },
            { url: 'https://the-decoder.com', label: 'The Decoder' },
            { url: 'https://www.marktechpost.com', label: 'MarkTechPost' },
            { url: 'https://aisafety.info', label: 'AI Safety Info' },
          ]},
          { id: 'tech-ai-tools', name: 'AI Tools & Agents', seeds: [
            { url: 'https://www.langchain.com', label: 'LangChain' },
            { url: 'https://docs.llamaindex.ai', label: 'LlamaIndex' },
            { url: 'https://github.com/ggerganov/llama.cpp', label: 'llama.cpp' },
            { url: 'https://www.cursor.com', label: 'Cursor' },
          ]},
          { id: 'tech-security', name: 'Cybersecurity', seeds: [
            { url: 'https://owasp.org', label: 'OWASP' },
            { url: 'https://www.schneier.com', label: 'Schneier on Security' },
            { url: 'https://krebsonsecurity.com', label: 'Krebs on Security' },
          ]},
          { id: 'tech-hacking', name: 'Hacking & CTF', seeds: [
            { url: 'https://www.hackthebox.com', label: 'Hack The Box' },
            { url: 'https://tryhackme.com', label: 'TryHackMe' },
            { url: 'https://ctftime.org', label: 'CTFtime' },
            { url: 'https://portswigger.net/web-security', label: 'PortSwigger Academy' },
          ]},
          { id: 'tech-infosec', name: 'Infosec & Bug Bounty', seeds: [
            { url: 'https://www.hackerone.com', label: 'HackerOne' },
            { url: 'https://thehackernews.com', label: 'The Hacker News' },
            { url: 'https://www.exploit-db.com', label: 'Exploit-DB' },
            { url: 'https://www.offensive-security.com', label: 'Offensive Security' },
          ]},
          { id: 'tech-reversing', name: 'Reverse Engineering', seeds: [
            { url: 'https://crackmes.one', label: 'crackmes.one' },
            { url: 'https://ghidra-sre.org', label: 'Ghidra' },
            { url: 'https://malwareunicorn.org', label: 'Malware Unicorn' },
          ]},
          { id: 'tech-hardware', name: 'Hardware', seeds: [
            { url: 'https://www.anandtech.com', label: 'AnandTech' },
            { url: 'https://www.tomshardware.com', label: "Tom's Hardware" },
          ]},
          { id: 'tech-mobile', name: 'Mobile Dev', seeds: [
            { url: 'https://developer.android.com', label: 'Android Dev' },
            { url: 'https://developer.apple.com', label: 'Apple Dev' },
          ]},
          { id: 'tech-algorithms', name: 'Algorithms & DS', seeds: [
            { url: 'https://leetcode.com', label: 'LeetCode' },
            { url: 'https://codeforces.com', label: 'Codeforces' },
            { url: 'https://www.geeksforgeeks.org', label: 'GeeksforGeeks' },
          ]},
          { id: 'tech-systems', name: 'Systems Programming', seeds: [
            { url: 'https://www.rust-lang.org', label: 'Rust' },
            { url: 'https://ziglang.org', label: 'Zig' },
            { url: 'https://cppreference.com', label: 'cppreference' },
          ]},
        ],
      },
      {
        id: 'opensource', name: 'Open Source', icon: 'network',
        desc: 'Open-source projects, communities, and foundations',
        subcategories: [
          { id: 'opensource-projects', name: 'Projects', seeds: [
            { url: 'https://github.com/trending', label: 'GitHub Trending' },
            { url: 'https://sr.ht', label: 'Sourcehut' },
            { url: 'https://codeberg.org', label: 'Codeberg' },
          ]},
          { id: 'opensource-communities', name: 'Communities', seeds: [
            { url: 'https://opensource.org', label: 'OSI' },
            { url: 'https://www.fsf.org', label: 'FSF' },
          ]},
          { id: 'opensource-tools', name: 'Tools', seeds: [
            { url: 'https://gitlab.com', label: 'GitLab' },
            { url: 'https://forgejo.org', label: 'Forgejo' },
          ]},
          { id: 'opensource-foundations', name: 'Foundations', seeds: [
            { url: 'https://apache.org', label: 'Apache' },
            { url: 'https://www.linuxfoundation.org', label: 'Linux Foundation' },
          ]},
          { id: 'opensource-linux', name: 'Linux & BSD', seeds: [
            { url: 'https://www.kernel.org', label: 'kernel.org' },
            { url: 'https://wiki.archlinux.org', label: 'Arch Wiki' },
            { url: 'https://www.freebsd.org', label: 'FreeBSD' },
          ]},
        ],
      },
      {
        id: 'infra', name: 'Cloud & DevOps', icon: 'database',
        desc: 'Infrastructure, databases, containers, and monitoring',
        subcategories: [
          { id: 'infra-cloud', name: 'Cloud', seeds: [
            { url: 'https://kubernetes.io/docs/', label: 'Kubernetes' },
            { url: 'https://docs.docker.com', label: 'Docker' },
          ]},
          { id: 'infra-devops', name: 'DevOps', seeds: [
            { url: 'https://prometheus.io/docs/', label: 'Prometheus' },
            { url: 'https://nginx.com', label: 'Nginx' },
          ]},
          { id: 'infra-networking', name: 'Networking', seeds: [
            { url: 'https://www.cloudflare.com/learning/', label: 'Cloudflare Learning' },
            { url: 'https://www.wireguard.com', label: 'WireGuard' },
          ]},
          { id: 'infra-databases', name: 'Databases', seeds: [
            { url: 'https://redis.io/docs/', label: 'Redis' },
            { url: 'https://www.postgresql.org/docs/', label: 'PostgreSQL' },
          ]},
          { id: 'infra-cicd', name: 'CI/CD', seeds: [
            { url: 'https://docs.github.com/en/actions', label: 'GitHub Actions' },
            { url: 'https://www.jenkins.io', label: 'Jenkins' },
          ]},
          { id: 'infra-observability', name: 'Observability', seeds: [
            { url: 'https://grafana.com', label: 'Grafana' },
            { url: 'https://opentelemetry.io', label: 'OpenTelemetry' },
          ]},
        ],
      },
      {
        id: 'webdev', name: 'Web & Frontend', icon: 'globe',
        desc: 'Web standards, frameworks, CSS, and browser APIs',
        subcategories: [
          { id: 'webdev-frontend', name: 'Frontend', seeds: [
            { url: 'https://developer.mozilla.org', label: 'MDN' },
            { url: 'https://web.dev', label: 'web.dev' },
            { url: 'https://css-tricks.com', label: 'CSS-Tricks' },
          ]},
          { id: 'webdev-backend', name: 'Backend', seeds: [
            { url: 'https://go.dev', label: 'Go' },
            { url: 'https://docs.python.org/3/', label: 'Python' },
            { url: 'https://nodejs.org/en/docs', label: 'Node.js' },
          ]},
          { id: 'webdev-frameworks', name: 'Frameworks', seeds: [
            { url: 'https://reactjs.org', label: 'React' },
            { url: 'https://vuejs.org', label: 'Vue' },
            { url: 'https://svelte.dev', label: 'Svelte' },
          ]},
          { id: 'webdev-apis', name: 'APIs & Tools', seeds: [
            { url: 'https://htmx.org', label: 'htmx' },
            { url: 'https://tailwindcss.com', label: 'Tailwind' },
            { url: 'https://nextjs.org', label: 'Next.js' },
          ]},
          { id: 'webdev-perf', name: 'Performance', seeds: [
            { url: 'https://pagespeed.web.dev', label: 'PageSpeed Insights' },
            { url: 'https://www.webpagetest.org', label: 'WebPageTest' },
          ]},
        ],
      },
      {
        id: 'datascience', name: 'Data Science', icon: 'trendingUp',
        desc: 'Data analysis, visualization, statistics, and big data',
        subcategories: [
          { id: 'datascience-analysis', name: 'Analysis & Viz', seeds: [
            { url: 'https://www.kaggle.com', label: 'Kaggle' },
            { url: 'https://www.datacamp.com', label: 'DataCamp' },
          ]},
          { id: 'datascience-stats', name: 'Statistics', seeds: [
            { url: 'https://www.stat.berkeley.edu', label: 'Berkeley Stats' },
            { url: 'https://seeing-theory.brown.edu', label: 'Seeing Theory' },
          ]},
          { id: 'datascience-bigdata', name: 'Big Data', seeds: [
            { url: 'https://spark.apache.org', label: 'Apache Spark' },
            { url: 'https://kafka.apache.org', label: 'Apache Kafka' },
          ]},
        ],
      },
      {
        id: 'blockchain', name: 'Blockchain & Web3', icon: 'network',
        desc: 'Blockchain tech, decentralized protocols, Web3, and crypto',
        subcategories: [
          { id: 'blockchain-protocols', name: 'Layer 1 Protocols', seeds: [
            { url: 'https://ethereum.org', label: 'Ethereum' },
            { url: 'https://bitcoin.org', label: 'Bitcoin.org' },
            { url: 'https://solana.com', label: 'Solana' },
            { url: 'https://cosmos.network', label: 'Cosmos' },
          ]},
          { id: 'blockchain-l2', name: 'Layer 2 & Scaling', seeds: [
            { url: 'https://www.optimism.io', label: 'Optimism' },
            { url: 'https://polygon.technology', label: 'Polygon' },
            { url: 'https://www.starknet.io', label: 'StarkNet' },
          ]},
          { id: 'blockchain-defi', name: 'DeFi', seeds: [
            { url: 'https://defillama.com', label: 'DefiLlama' },
            { url: 'https://www.coindesk.com', label: 'CoinDesk' },
            { url: 'https://dune.com', label: 'Dune Analytics' },
          ]},
          { id: 'blockchain-dev', name: 'Smart Contract Dev', seeds: [
            { url: 'https://docs.soliditylang.org', label: 'Solidity' },
            { url: 'https://hardhat.org', label: 'Hardhat' },
            { url: 'https://book.getfoundry.sh', label: 'Foundry' },
          ]},
          { id: 'blockchain-nft', name: 'NFTs & Digital Art', seeds: [
            { url: 'https://opensea.io', label: 'OpenSea' },
            { url: 'https://foundation.app', label: 'Foundation' },
          ]},
          { id: 'blockchain-privacy', name: 'Privacy & ZK', seeds: [
            { url: 'https://z.cash', label: 'Zcash' },
            { url: 'https://zkp.science', label: 'ZK Proofs' },
          ]},
        ],
      },
      {
        id: 'robotics', name: 'Robotics & IoT', icon: 'cpu',
        desc: 'Robotics, embedded systems, IoT, drones, and hardware hacking',
        subcategories: [
          { id: 'robotics-general', name: 'Robotics', seeds: [
            { url: 'https://www.ros.org', label: 'ROS' },
            { url: 'https://spectrum.ieee.org/topic/robotics', label: 'IEEE Robotics' },
            { url: 'https://www.therobotreport.com', label: 'The Robot Report' },
          ]},
          { id: 'robotics-iot', name: 'IoT', seeds: [
            { url: 'https://www.home-assistant.io', label: 'Home Assistant' },
            { url: 'https://mqtt.org', label: 'MQTT' },
            { url: 'https://www.iotworldtoday.com', label: 'IoT World Today' },
          ]},
          { id: 'robotics-embedded', name: 'Embedded Systems', seeds: [
            { url: 'https://www.arduino.cc', label: 'Arduino' },
            { url: 'https://www.raspberrypi.org', label: 'Raspberry Pi' },
            { url: 'https://www.espressif.com', label: 'Espressif' },
          ]},
          { id: 'robotics-drones', name: 'Drones & UAVs', seeds: [
            { url: 'https://www.dronedj.com', label: 'DroneDJ' },
            { url: 'https://ardupilot.org', label: 'ArduPilot' },
          ]},
          { id: 'robotics-autonomous', name: 'Autonomous Vehicles', seeds: [
            { url: 'https://www.autoware.org', label: 'Autoware' },
            { url: 'https://comma.ai', label: 'comma.ai' },
          ]},
        ],
      },
      {
        id: 'quantum', name: 'Quantum Computing', icon: 'cpu',
        desc: 'Quantum hardware, algorithms, simulators, and research',
        subcategories: [
          { id: 'quantum-research', name: 'Research & News', seeds: [
            { url: 'https://quantumai.google', label: 'Google Quantum AI' },
            { url: 'https://www.ibm.com/quantum', label: 'IBM Quantum' },
            { url: 'https://quantum-journal.org', label: 'Quantum Journal' },
          ]},
          { id: 'quantum-learn', name: 'Learning', seeds: [
            { url: 'https://qiskit.org/learn', label: 'Qiskit Learn' },
            { url: 'https://pennylane.ai', label: 'PennyLane' },
            { url: 'https://quantum.country', label: 'Quantum Country' },
          ]},
          { id: 'quantum-hardware', name: 'Hardware & Companies', seeds: [
            { url: 'https://ionq.com', label: 'IonQ' },
            { url: 'https://www.rigetti.com', label: 'Rigetti' },
            { url: 'https://www.pasqal.com', label: 'Pasqal' },
          ]},
        ],
      },
      {
        id: 'biotech', name: 'Biotech & Nanotech', icon: 'cpu',
        desc: 'Biotechnology, CRISPR, synthetic biology, and nanotechnology',
        subcategories: [
          { id: 'biotech-gene', name: 'Gene Editing & CRISPR', seeds: [
            { url: 'https://www.broadinstitute.org', label: 'Broad Institute' },
            { url: 'https://www.genengnews.com', label: 'GEN' },
          ]},
          { id: 'biotech-synbio', name: 'Synthetic Biology', seeds: [
            { url: 'https://www.synbiobeta.com', label: 'SynBioBeta' },
            { url: 'https://igem.org', label: 'iGEM' },
          ]},
          { id: 'biotech-nano', name: 'Nanotechnology', seeds: [
            { url: 'https://www.nano.gov', label: 'Nano.gov' },
            { url: 'https://www.nanowerk.com', label: 'Nanowerk' },
          ]},
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════
  // GROUP 5: Business & Finance
  // ══════════════════════════════════════════════════════
  {
    id: 'business', name: 'Business & Finance', icon: 'trendingUp',
    categories: [
      {
        id: 'finance', name: 'Finance & Investing', icon: 'trendingUp',
        desc: 'Markets, personal finance, investing, and financial literacy',
        subcategories: [
          { id: 'finance-markets', name: 'Markets', seeds: [
            { url: 'https://finance.yahoo.com', label: 'Yahoo Finance' },
            { url: 'https://www.marketwatch.com', label: 'MarketWatch' },
            { url: 'https://www.investing.com', label: 'Investing.com' },
          ]},
          { id: 'finance-personal', name: 'Personal Finance', seeds: [
            { url: 'https://www.nerdwallet.com', label: 'NerdWallet' },
            { url: 'https://www.investopedia.com', label: 'Investopedia' },
          ]},
          { id: 'finance-crypto', name: 'Crypto Markets', seeds: [
            { url: 'https://www.coingecko.com', label: 'CoinGecko' },
            { url: 'https://messari.io', label: 'Messari' },
          ]},
          { id: 'finance-realestate', name: 'Real Estate Investing', seeds: [
            { url: 'https://www.biggerpockets.com', label: 'BiggerPockets' },
            { url: 'https://www.reit.com', label: 'REIT.com' },
          ]},
        ],
      },
      {
        id: 'startups', name: 'Startups & Entrepreneurship', icon: 'trendingUp',
        desc: 'Startup culture, venture capital, and founder resources',
        subcategories: [
          { id: 'startups-news', name: 'Startup News', seeds: [
            { url: 'https://techcrunch.com', label: 'TechCrunch' },
            { url: 'https://news.ycombinator.com', label: 'Hacker News' },
            { url: 'https://lobste.rs', label: 'Lobsters' },
          ]},
          { id: 'startups-vc', name: 'Venture Capital', seeds: [
            { url: 'https://www.crunchbase.com', label: 'Crunchbase' },
            { url: 'https://a16z.com', label: 'a16z' },
          ]},
          { id: 'startups-indie', name: 'Indie Hackers', seeds: [
            { url: 'https://www.indiehackers.com', label: 'Indie Hackers' },
            { url: 'https://microconf.com', label: 'MicroConf' },
          ]},
          { id: 'startups-tools', name: 'Business Tools', seeds: [
            { url: 'https://www.producthunt.com', label: 'Product Hunt' },
            { url: 'https://www.saastr.com', label: 'SaaStr' },
          ]},
        ],
      },
      {
        id: 'economics', name: 'Economics', icon: 'trendingUp',
        desc: 'Economic theory, policy, and global markets',
        subcategories: [
          { id: 'economics-macro', name: 'Macroeconomics', seeds: [
            { url: 'https://www.imf.org', label: 'IMF' },
            { url: 'https://www.worldbank.org', label: 'World Bank' },
          ]},
          { id: 'economics-research', name: 'Research', seeds: [
            { url: 'https://www.nber.org', label: 'NBER' },
            { url: 'https://freakonomics.com', label: 'Freakonomics' },
          ]},
          { id: 'economics-policy', name: 'Policy & Think Tanks', seeds: [
            { url: 'https://www.brookings.edu', label: 'Brookings' },
            { url: 'https://www.cato.org', label: 'Cato Institute' },
          ]},
        ],
      },
      {
        id: 'careers', name: 'Careers & Professional', icon: 'trendingUp',
        desc: 'Job hunting, career development, and professional growth',
        subcategories: [
          { id: 'careers-jobs', name: 'Job Boards', seeds: [
            { url: 'https://www.linkedin.com', label: 'LinkedIn' },
            { url: 'https://www.indeed.com', label: 'Indeed' },
          ]},
          { id: 'careers-remote', name: 'Remote Work', seeds: [
            { url: 'https://weworkremotely.com', label: 'We Work Remotely' },
            { url: 'https://remoteok.com', label: 'RemoteOK' },
          ]},
          { id: 'careers-freelance', name: 'Freelancing', seeds: [
            { url: 'https://www.upwork.com', label: 'Upwork' },
            { url: 'https://www.toptal.com', label: 'Toptal' },
          ]},
          { id: 'careers-skills', name: 'Skills & Certifications', seeds: [
            { url: 'https://www.pluralsight.com', label: 'Pluralsight' },
            { url: 'https://www.credential.net', label: 'Credential.net' },
          ]},
        ],
      },
      {
        id: 'marketing', name: 'Marketing & Growth', icon: 'megaphone',
        desc: 'Digital marketing, SEO, content strategy, and analytics',
        subcategories: [
          { id: 'marketing-seo', name: 'SEO', seeds: [
            { url: 'https://moz.com', label: 'Moz' },
            { url: 'https://ahrefs.com/blog', label: 'Ahrefs Blog' },
          ]},
          { id: 'marketing-content', name: 'Content Marketing', seeds: [
            { url: 'https://contentmarketinginstitute.com', label: 'CMI' },
            { url: 'https://copyblogger.com', label: 'Copyblogger' },
          ]},
          { id: 'marketing-social', name: 'Social Media', seeds: [
            { url: 'https://buffer.com/resources', label: 'Buffer' },
            { url: 'https://sproutsocial.com/insights', label: 'Sprout Social' },
          ]},
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════
  // GROUP 6: Society & Environment
  // ══════════════════════════════════════════════════════
  {
    id: 'society', name: 'Society & Environment', icon: 'globe',
    categories: [
      {
        id: 'environment', name: 'Environment & Climate', icon: 'globe',
        desc: 'Climate science, sustainability, and environmental policy',
        subcategories: [
          { id: 'environment-climate', name: 'Climate Science', seeds: [
            { url: 'https://climate.nasa.gov', label: 'NASA Climate' },
            { url: 'https://www.ipcc.ch', label: 'IPCC' },
            { url: 'https://www.carbonbrief.org', label: 'Carbon Brief' },
          ]},
          { id: 'environment-energy', name: 'Renewable Energy', seeds: [
            { url: 'https://www.irena.org', label: 'IRENA' },
            { url: 'https://cleantechnica.com', label: 'CleanTechnica' },
          ]},
          { id: 'environment-conservation', name: 'Conservation', seeds: [
            { url: 'https://www.iucn.org', label: 'IUCN' },
            { url: 'https://www.conservation.org', label: 'Conservation International' },
          ]},
          { id: 'environment-zerowaste', name: 'Zero Waste', seeds: [
            { url: 'https://zerowastehome.com', label: 'Zero Waste Home' },
            { url: 'https://www.treehugger.com', label: 'Treehugger' },
          ]},
        ],
      },
      {
        id: 'social', name: 'Social Issues & Activism', icon: 'megaphone',
        desc: 'Social justice, activism, nonprofits, and civic engagement',
        subcategories: [
          { id: 'social-justice', name: 'Social Justice', seeds: [
            { url: 'https://www.aclu.org', label: 'ACLU' },
            { url: 'https://www.hrw.org', label: 'Human Rights Watch' },
          ]},
          { id: 'social-nonprofit', name: 'Nonprofits', seeds: [
            { url: 'https://www.charitynavigator.org', label: 'Charity Navigator' },
            { url: 'https://www.givewell.org', label: 'GiveWell' },
          ]},
          { id: 'social-civic', name: 'Civic Tech', seeds: [
            { url: 'https://www.codeforamerica.org', label: 'Code for America' },
            { url: 'https://www.mysociety.org', label: 'mySociety' },
          ]},
        ],
      },
      {
        id: 'religion', name: 'Religion & Spirituality', icon: 'globe',
        desc: 'World religions, theology, meditation, and spiritual traditions',
        subcategories: [
          { id: 'religion-world', name: 'World Religions', seeds: [
            { url: 'https://www.bbc.co.uk/religion', label: 'BBC Religion' },
            { url: 'https://www.patheos.com', label: 'Patheos' },
          ]},
          { id: 'religion-texts', name: 'Sacred Texts', seeds: [
            { url: 'https://www.sacred-texts.com', label: 'Sacred Texts Archive' },
            { url: 'https://www.biblegateway.com', label: 'Bible Gateway' },
          ]},
          { id: 'religion-mindfulness', name: 'Mindfulness & Meditation', seeds: [
            { url: 'https://www.lionsroar.com', label: "Lion's Roar" },
            { url: 'https://www.mindful.org', label: 'Mindful.org' },
          ]},
        ],
      },
      {
        id: 'languages', name: 'Linguistics & World Languages', icon: 'globe',
        desc: 'Linguistics, endangered languages, translation, and etymology',
        subcategories: [
          { id: 'languages-linguistics', name: 'Linguistics', seeds: [
            { url: 'https://www.linguisticsociety.org', label: 'LSA' },
            { url: 'https://www.ethnologue.com', label: 'Ethnologue' },
          ]},
          { id: 'languages-etymology', name: 'Etymology', seeds: [
            { url: 'https://www.etymonline.com', label: 'Etymonline' },
            { url: 'https://en.wiktionary.org', label: 'Wiktionary' },
          ]},
          { id: 'languages-translation', name: 'Translation', seeds: [
            { url: 'https://www.proz.com', label: 'ProZ' },
            { url: 'https://www.deepl.com', label: 'DeepL' },
          ]},
        ],
      },
      {
        id: 'psychology', name: 'Psychology & Behavior', icon: 'cpu',
        desc: 'Behavioral science, cognitive psychology, and decision-making',
        subcategories: [
          { id: 'psychology-cognitive', name: 'Cognitive Science', seeds: [
            { url: 'https://www.apa.org', label: 'APA' },
            { url: 'https://www.cognitiontoday.com', label: 'Cognition Today' },
          ]},
          { id: 'psychology-behavioral', name: 'Behavioral Science', seeds: [
            { url: 'https://behavioralscientist.org', label: 'Behavioral Scientist' },
            { url: 'https://www.lesswrong.com', label: 'LessWrong' },
          ]},
          { id: 'psychology-relationships', name: 'Relationships', seeds: [
            { url: 'https://www.gottman.com', label: 'Gottman Institute' },
            { url: 'https://www.verywellmind.com', label: 'Verywell Mind' },
          ]},
        ],
      },
      {
        id: 'mystery', name: 'Mystery & Paranormal', icon: 'globe',
        desc: 'Mysteries, UFOs, cryptozoology, conspiracy analysis, and the unexplained',
        subcategories: [
          { id: 'mystery-ufo', name: 'UFOs & Aliens', seeds: [
            { url: 'https://www.theblackvault.com', label: 'The Black Vault' },
            { url: 'https://nuforc.org', label: 'NUFORC' },
            { url: 'https://www.uapinfo.org', label: 'UAP Info' },
            { url: 'https://www.mufon.com', label: 'MUFON' },
          ]},
          { id: 'mystery-paranormal', name: 'Paranormal', seeds: [
            { url: 'https://www.coasttocoastam.com', label: 'Coast to Coast AM' },
            { url: 'https://mysteriousuniverse.org', label: 'Mysterious Universe' },
          ]},
          { id: 'mystery-crypto', name: 'Cryptozoology', seeds: [
            { url: 'https://www.cryptozoologynews.com', label: 'Cryptozoology News' },
            { url: 'https://cryptomundo.com', label: 'Cryptomundo' },
          ]},
          { id: 'mystery-unsolved', name: 'Unsolved Mysteries', seeds: [
            { url: 'https://unsolvedmysteries.fandom.com', label: 'Unsolved Mysteries Wiki' },
            { url: 'https://www.theunresolvedpodcast.com', label: 'The Unresolved' },
          ]},
          { id: 'mystery-conspiracy', name: 'Conspiracy Analysis', seeds: [
            { url: 'https://www.snopes.com', label: 'Snopes' },
            { url: 'https://rationalwiki.org', label: 'RationalWiki' },
          ]},
          { id: 'mystery-myths', name: 'Myths & Folklore', seeds: [
            { url: 'https://www.mythologysource.com', label: 'Mythology Source' },
            { url: 'https://www.theoi.com', label: 'Theoi (Greek Mythology)' },
            { url: 'https://norse-mythology.org', label: 'Norse Mythology' },
          ]},
          { id: 'mystery-fortean', name: 'Fortean & Weird', seeds: [
            { url: 'https://fortean-times.com', label: 'Fortean Times' },
            { url: 'https://www.atlasobscura.com', label: 'Atlas Obscura' },
            { url: 'https://www.theanomalien.com', label: 'The Anomalien' },
          ]},
        ],
      },
      {
        id: 'privacy-search', name: 'Privacy & Search Engines', icon: 'globe',
        desc: 'Alternative search engines, privacy tools, digital rights, and surveillance',
        subcategories: [
          { id: 'privacy-search-alt', name: 'Alt Search Engines', seeds: [
            { url: 'https://searx.space', label: 'SearXNG Instances' },
            { url: 'https://www.mojeek.com', label: 'Mojeek' },
            { url: 'https://yacy.net', label: 'YaCy' },
            { url: 'https://search.brave.com', label: 'Brave Search' },
            { url: 'https://www.qwant.com', label: 'Qwant' },
          ]},
          { id: 'privacy-digital', name: 'Digital Privacy', seeds: [
            { url: 'https://www.privacyguides.org', label: 'Privacy Guides' },
            { url: 'https://www.eff.org', label: 'EFF' },
            { url: 'https://ssd.eff.org', label: 'Surveillance Self-Defense' },
          ]},
          { id: 'privacy-tools', name: 'Privacy Software', seeds: [
            { url: 'https://www.torproject.org', label: 'Tor Project' },
            { url: 'https://signal.org', label: 'Signal' },
            { url: 'https://tails.net', label: 'Tails OS' },
            { url: 'https://www.qubes-os.org', label: 'Qubes OS' },
          ]},
          { id: 'privacy-surveillance', name: 'Surveillance & Rights', seeds: [
            { url: 'https://www.accessnow.org', label: 'Access Now' },
            { url: 'https://privacyinternational.org', label: 'Privacy International' },
          ]},
          { id: 'privacy-decentralized', name: 'Decentralized Web', seeds: [
            { url: 'https://ipfs.tech', label: 'IPFS' },
            { url: 'https://dat-ecosystem.org', label: 'Dat Ecosystem' },
            { url: 'https://scuttlebutt.nz', label: 'Scuttlebutt' },
          ]},
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════
  // GROUP 7: DIY & Maker
  // ══════════════════════════════════════════════════════
  {
    id: 'maker', name: 'DIY & Maker', icon: 'cpu',
    categories: [
      {
        id: 'diy', name: 'DIY & Crafts', icon: 'cpu',
        desc: 'Maker projects, crafting, 3D printing, and hands-on builds',
        subcategories: [
          { id: 'diy-projects', name: 'Projects', seeds: [
            { url: 'https://www.instructables.com', label: 'Instructables' },
            { url: 'https://hackaday.com', label: 'Hackaday' },
          ]},
          { id: 'diy-3dprint', name: '3D Printing', seeds: [
            { url: 'https://www.thingiverse.com', label: 'Thingiverse' },
            { url: 'https://www.prusa3d.com', label: 'Prusa' },
            { url: 'https://all3dp.com', label: 'All3DP' },
          ]},
          { id: 'diy-woodworking', name: 'Woodworking', seeds: [
            { url: 'https://www.woodmagazine.com', label: 'Wood Magazine' },
            { url: 'https://www.popularwoodworking.com', label: 'Popular Woodworking' },
          ]},
          { id: 'diy-sewing', name: 'Sewing & Textiles', seeds: [
            { url: 'https://www.ravelry.com', label: 'Ravelry' },
            { url: 'https://www.sewmagazine.co.uk', label: 'Sew Magazine' },
          ]},
          { id: 'diy-electronics', name: 'Electronics', seeds: [
            { url: 'https://www.adafruit.com', label: 'Adafruit' },
            { url: 'https://www.sparkfun.com', label: 'SparkFun' },
          ]},
          { id: 'diy-howto', name: 'How-To Guides', seeds: [
            { url: 'https://www.wikihow.com', label: 'wikiHow' },
            { url: 'https://www.ifixit.com', label: 'iFixit' },
            { url: 'https://makezine.com', label: 'Make Magazine' },
            { url: 'https://www.popularmechanics.com', label: 'Popular Mechanics' },
          ]},
          { id: 'diy-leatherwork', name: 'Leatherwork & Metalwork', seeds: [
            { url: 'https://www.leathercraftlibrary.com', label: 'Leathercraft Library' },
            { url: 'https://www.iforgeiron.com', label: 'IForgeIron' },
          ]},
          { id: 'diy-pottery', name: 'Pottery & Ceramics', seeds: [
            { url: 'https://www.ceramicartsnetwork.org', label: 'Ceramic Arts Network' },
            { url: 'https://thepotterywheel.com', label: 'The Pottery Wheel' },
          ]},
        ],
      },
      {
        id: 'auto', name: 'Automotive & Motorsport', icon: 'trendingUp',
        desc: 'Cars, motorcycles, restoration, and motorsport',
        subcategories: [
          { id: 'auto-news', name: 'Automotive News', seeds: [
            { url: 'https://www.caranddriver.com', label: 'Car and Driver' },
            { url: 'https://www.motortrend.com', label: 'MotorTrend' },
          ]},
          { id: 'auto-ev', name: 'Electric Vehicles', seeds: [
            { url: 'https://electrek.co', label: 'Electrek' },
            { url: 'https://insideevs.com', label: 'InsideEVs' },
          ]},
          { id: 'auto-motorsport', name: 'Motorsport', seeds: [
            { url: 'https://www.formula1.com', label: 'Formula 1' },
            { url: 'https://www.autosport.com', label: 'Autosport' },
          ]},
          { id: 'auto-restoration', name: 'Restoration & Mods', seeds: [
            { url: 'https://www.hagerty.com', label: 'Hagerty' },
            { url: 'https://bringatrailer.com', label: 'Bring a Trailer' },
          ]},
          { id: 'auto-motorcycle', name: 'Motorcycles', seeds: [
            { url: 'https://www.revzilla.com', label: 'RevZilla' },
            { url: 'https://www.cycleworld.com', label: 'Cycle World' },
          ]},
        ],
      },
      {
        id: 'photo-video', name: 'Photography & Video', icon: 'image',
        desc: 'Camera gear, editing tutorials, and videography',
        subcategories: [
          { id: 'photo-gear', name: 'Gear & Reviews', seeds: [
            { url: 'https://www.dpreview.com', label: 'DPReview' },
            { url: 'https://www.imaging-resource.com', label: 'Imaging Resource' },
          ]},
          { id: 'photo-editing', name: 'Editing & Post', seeds: [
            { url: 'https://fstoppers.com', label: 'Fstoppers' },
            { url: 'https://phlearn.com', label: 'PHLEARN' },
          ]},
          { id: 'photo-videography', name: 'Videography', seeds: [
            { url: 'https://www.premiumbeat.com/blog', label: 'PremiumBeat Blog' },
            { url: 'https://www.cinema5d.com', label: 'cinema5D' },
          ]},
        ],
      },
      {
        id: 'homelab', name: 'Homelab & Self-Hosting', icon: 'database',
        desc: 'Home servers, self-hosted services, NAS builds, and privacy tools',
        subcategories: [
          { id: 'homelab-selfhost', name: 'Self-Hosting', seeds: [
            { url: 'https://www.reddit.com/r/selfhosted', label: 'r/selfhosted' },
            { url: 'https://awesome-selfhosted.net', label: 'Awesome Self-Hosted' },
            { url: 'https://noted.lol', label: 'Noted' },
          ]},
          { id: 'homelab-servers', name: 'Home Servers & NAS', seeds: [
            { url: 'https://www.servethehome.com', label: 'ServeTheHome' },
            { url: 'https://www.truenas.com', label: 'TrueNAS' },
            { url: 'https://unraid.net', label: 'Unraid' },
            { url: 'https://www.reddit.com/r/homelab', label: 'r/homelab' },
          ]},
          { id: 'homelab-privacy', name: 'Privacy Tools', seeds: [
            { url: 'https://www.privacyguides.org', label: 'Privacy Guides' },
            { url: 'https://www.eff.org/pages/tools', label: 'EFF Tools' },
            { url: 'https://prism-break.org', label: 'PRISM Break' },
          ]},
          { id: 'homelab-networking', name: 'Home Networking', seeds: [
            { url: 'https://openwrt.org', label: 'OpenWrt' },
            { url: 'https://www.pfsense.org', label: 'pfSense' },
            { url: 'https://pi-hole.net', label: 'Pi-hole' },
          ]},
          { id: 'homelab-containers', name: 'Home Containers', seeds: [
            { url: 'https://www.portainer.io', label: 'Portainer' },
            { url: 'https://www.proxmox.com', label: 'Proxmox' },
            { url: 'https://tailscale.com', label: 'Tailscale' },
          ]},
          { id: 'homelab-communities', name: 'Communities & Forums', seeds: [
            { url: 'https://news.ycombinator.com', label: 'Hacker News' },
            { url: 'https://lobste.rs', label: 'Lobsters' },
            { url: 'https://tildes.net', label: 'Tildes' },
            { url: 'https://www.reddit.com/r/homeserver', label: 'r/homeserver' },
          ]},
        ],
      },
    ],
  },
];

// Flatten for backward compat
const CATEGORIES = CATEGORY_GROUPS.flatMap(g => g.categories);

const STEP_LABELS = ['Welcome', 'Identity', 'Focus', 'Settings', 'Launch'];

const DEPTH_DESCRIPTIONS = [
  '', // 0 unused
  'Shallow — only seed pages themselves',
  'Light — seed pages + their direct links',
  'Balanced — good breadth without overloading',
  'Deep — thorough crawl, more resources used',
  'Maximum — extensive crawl, highest resource usage',
];

function getAllSelectedSeeds() {
  const seeds = [];
  for (const cat of CATEGORIES) {
    for (const sub of cat.subcategories) {
      if (selectedSubs.has(sub.id)) {
        seeds.push(...sub.seeds.map(s => s.url));
      }
    }
  }
  const custom = customSeeds.split('\n').map(s => s.trim()).filter(s => s.startsWith('http://') || s.startsWith('https://'));
  seeds.push(...custom);
  return [...new Set(seeds)].filter(s => !removedSeeds.has(s));
}

function countStats() {
  const seeds = getAllSelectedSeeds();
  const catCount = CATEGORIES.filter(c => c.subcategories.some(s => selectedSubs.has(s.id))).length;
  const customCount = customSeeds.split('\n').map(s => s.trim()).filter(s => s.startsWith('http://') || s.startsWith('https://')).length;
  return { total: seeds.length, catCount, customCount };
}

function growthEstimate() {
  const seeds = getAllSelectedSeeds();
  const n = seeds.length;
  const d = settings.depth;
  const w = settings.workers;
  return Math.min(n * Math.pow(8, Math.min(d, 3)), w * 60 * 12);
}

// Category selection state helpers
function catSelectionState(cat) {
  const total = cat.subcategories.length;
  const selected = cat.subcategories.filter(s => selectedSubs.has(s.id)).length;
  if (selected === 0) return 'none';
  if (selected === total) return 'full';
  return 'partial';
}

function toggleAllSubs(cat) {
  const state = catSelectionState(cat);
  if (state === 'full') {
    cat.subcategories.forEach(s => selectedSubs.delete(s.id));
  } else {
    cat.subcategories.forEach(s => selectedSubs.add(s.id));
  }
}

function totalSubsInGroup(group) {
  return group.categories.reduce((n, c) => n + c.subcategories.length, 0);
}

function selectedSubsInGroup(group) {
  return group.categories.reduce((n, c) => n + c.subcategories.filter(s => selectedSubs.has(s.id)).length, 0);
}

export function renderWizard(container) {
  currentStep = 0;
  selectedSubs.clear();
  removedSeeds.clear();
  expandedGroups.clear();
  expandedCategories.clear();
  customSeeds = '';
  settings = { depth: 3, workers: 4 };
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }

  container.innerHTML = `
    <div class="wizard-container">
      <div class="wizard-progress" id="wizard-progress"></div>
      <div class="wizard-body" id="wizard-body"></div>
      <div class="wizard-nav" id="wizard-nav"></div>
    </div>
  `;
  renderProgress();
  renderStep();
  renderNav();
}

function renderProgress() {
  const el = document.getElementById('wizard-progress');
  if (!el) return;
  el.innerHTML = STEP_LABELS.map((label, i) => {
    let cls = 'wizard-step-dot';
    if (i < currentStep) cls += ' completed';
    else if (i === currentStep) cls += ' active';
    const checkmark = i < currentStep ? '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="white" stroke-width="2.5"><polyline points="3 8.5 6.5 12 13 4"/></svg>' : (i + 1);
    return `
      ${i > 0 ? '<div class="wizard-step-line' + (i <= currentStep ? ' filled' : '') + '"></div>' : ''}
      <div class="${cls}">
        <span>${checkmark}</span>
      </div>
    `;
  }).join('');
}

function renderNav() {
  const el = document.getElementById('wizard-nav');
  if (!el) return;
  if (currentStep === 0 || currentStep === 4) {
    el.innerHTML = '';
    return;
  }

  el.innerHTML = `
    <button class="btn wizard-back-btn" id="wizard-back">Back</button>
    <button class="btn btn-primary wizard-next-btn" id="wizard-next">Next</button>
  `;
  document.getElementById('wizard-back').addEventListener('click', () => { currentStep--; update(); });
  document.getElementById('wizard-next').addEventListener('click', () => {
    if (currentStep === 2 && getAllSelectedSeeds().length === 0) {
      showModal('No Seeds Selected', `
        <div style="text-align:center;padding:8px 0">
          <div style="font-size:2.5em;margin-bottom:12px;opacity:0.7">${icon('alertTriangle', 48, 'var(--amber)')}</div>
          <p style="color:var(--text-secondary);line-height:1.6;margin-bottom:20px">
            Your node won't crawl anything without seed URLs.<br>
            You can always add them later from the <strong>Actions</strong> panel in the Admin Dashboard.
          </p>
          <div style="display:flex;gap:10px;justify-content:center">
            <button class="btn" id="wizard-alert-cancel">Go Back</button>
            <button class="btn btn-primary" id="wizard-alert-continue">Continue Anyway</button>
          </div>
        </div>
      `, { width: '440px' });
      setTimeout(() => {
        document.getElementById('wizard-alert-cancel')?.addEventListener('click', closeModal);
        document.getElementById('wizard-alert-continue')?.addEventListener('click', () => {
          closeModal();
          currentStep++; update();
        });
      }, 0);
      return;
    }
    currentStep++; update();
  });
}

function update() {
  renderProgress();
  renderStep();
  renderNav();
}

function renderStep() {
  const body = document.getElementById('wizard-body');
  if (!body) return;

  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
  if (cleanupDoogleAnim) { cleanupDoogleAnim(); cleanupDoogleAnim = null; }

  switch (currentStep) {
    case 0: renderWelcome(body); break;
    case 1: renderIdentity(body); break;
    case 2: renderFocus(body); break;
    case 3: renderSettings(body); break;
    case 4: renderLaunch(body); break;
  }
}

// ─── Step 0: Welcome ──────────────────────────────────
function renderWelcome(el) {
  el.innerHTML = `
    <div class="wizard-welcome">
      <div class="wizard-owl">
        <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M35 38 L28 12 L45 32" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" opacity="0.7"/>
          <path d="M85 38 L92 12 L75 32" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" opacity="0.7"/>
          <ellipse cx="60" cy="68" rx="36" ry="40" fill="var(--bg-card)" stroke="var(--accent)" stroke-width="2" opacity="0.9"/>
          <circle cx="44" cy="58" r="16" fill="var(--bg-secondary)" stroke="var(--accent)" stroke-width="1.5" opacity="0.8"/>
          <circle cx="44" cy="58" r="8" fill="var(--accent)" opacity="0.7"/>
          <circle cx="44" cy="58" r="3.5" fill="var(--bg-primary)"/>
          <circle cx="41" cy="55" r="2.5" fill="white" opacity="0.5"/>
          <circle cx="76" cy="58" r="16" fill="var(--bg-secondary)" stroke="var(--accent)" stroke-width="1.5" opacity="0.8"/>
          <circle cx="76" cy="58" r="8" fill="var(--accent)" opacity="0.7"/>
          <circle cx="76" cy="58" r="3.5" fill="var(--bg-primary)"/>
          <circle cx="73" cy="55" r="2.5" fill="white" opacity="0.5"/>
          <path d="M55 78 L60 88 L65 78Z" fill="var(--accent)" opacity="0.6"/>
          <path d="M44 98 L60 106 L76 98" stroke="var(--accent)" stroke-width="1.2" opacity="0.3"/>
        </svg>
      </div>
      <h1>Welcome to <a href="#/" class="wizard-doogle-link" id="wizard-doogle">Doogle</a></h1>
      <p>Doogle is a decentralized search engine — no central server, no tracking, no gatekeepers. Every node crawls a slice of the web and shares what it finds with the network.</p>
      <p>This wizard will walk you through <strong>4 quick steps</strong>: name your node, choose topics to crawl, review settings, and launch. It takes about a minute, and you can always change everything later.</p>
      <p class="wizard-append-note" id="wizard-append-note" style="display:none">You already have indexed data. Running the wizard again will <strong>add</strong> new topics to your existing index — nothing gets deleted.</p>
      <button class="btn btn-primary wizard-begin-btn" id="wizard-begin">Begin Setup</button>
    </div>
  `;
  document.getElementById('wizard-begin').addEventListener('click', () => { currentStep = 1; update(); });

  const doogleEl = document.getElementById('wizard-doogle');
  if (doogleEl) cleanupDoogleAnim = animateElement(doogleEl, 'Doogle');

  api.status().then(s => {
    if (s && s.indexed_docs > 0) {
      const note = document.getElementById('wizard-append-note');
      if (note) note.style.display = 'block';
    }
  }).catch(() => {});
}

// ─── Step 1: Node Identity ────────────────────────────
async function renderIdentity(el) {
  el.innerHTML = `<div class="wizard-identity"><div class="wizard-loading">Loading node info...</div></div>`;
  try {
    const s = await api.status();
    const peerId = s.peer_id || 'unknown';
    const truncated = peerId.length > 16 ? peerId.slice(0, 16) + '...' : peerId;
    const nodeName = s.node_name || '';
    const addrs = s.addrs || [];
    const peers = s.connected_peers || 0;

    el.innerHTML = `
      <div class="wizard-identity">
        <h2>Your Node</h2>
        <p class="wizard-subtitle">Every Doogle node has a unique cryptographic identity that lets it communicate with peers. Give yours a name so you can recognize it. The Peer ID is generated automatically and persists across restarts.</p>

        <div class="wizard-id-card">
          <div class="wizard-id-row">
            <span class="wizard-id-label">Node Name</span>
            <span class="wizard-id-value">
              <input type="text" id="wizard-node-name" value="${nodeName}" placeholder="Give your node a name..." maxlength="64" class="wizard-name-input">
              <button class="wizard-save-name-btn" id="wizard-save-name" title="Save name" style="display:none">
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 8.5 6.5 12 13 4"/></svg>
              </button>
            </span>
          </div>
          <div class="wizard-id-row">
            <span class="wizard-id-label">Peer ID</span>
            <span class="wizard-id-value mono">
              ${truncated}
              <button class="wizard-copy-btn" id="wizard-copy-pid" title="Copy full Peer ID">
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="5" width="9" height="9" rx="1"/><path d="M5 11H3.5A1.5 1.5 0 0 1 2 9.5V3.5A1.5 1.5 0 0 1 3.5 2h6A1.5 1.5 0 0 1 11 3.5V5"/></svg>
              </button>
            </span>
          </div>
          <div class="wizard-id-row">
            <span class="wizard-id-label">Addresses</span>
            <span class="wizard-id-value mono" style="font-size:0.82em">${addrs.length > 0 ? addrs.join('<br>') : '<span style="color:var(--text-muted)">None yet</span>'}</span>
          </div>
          <div class="wizard-id-row">
            <span class="wizard-id-label">Connected Peers</span>
            <span class="wizard-id-value">
              <span class="wizard-peer-dot ${peers > 0 ? 'online' : 'offline'}"></span>
              ${peers} peer${peers !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        ${peers === 0 ? `
          <div class="wizard-info-note">
            ${icon('radio', 16)} No peers connected yet — that's normal for a fresh node. mDNS will auto-discover nearby nodes on your local network, and the DHT will find peers across the internet. Peer count will grow over time.
          </div>
        ` : ''}
      </div>
    `;
    document.getElementById('wizard-copy-pid').addEventListener('click', () => {
      navigator.clipboard.writeText(peerId).then(() => {
        const btn = document.getElementById('wizard-copy-pid');
        btn.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="var(--green)" stroke-width="2"><polyline points="3 8.5 6.5 12 13 4"/></svg>';
        setTimeout(() => {
          btn.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="5" width="9" height="9" rx="1"/><path d="M5 11H3.5A1.5 1.5 0 0 1 2 9.5V3.5A1.5 1.5 0 0 1 3.5 2h6A1.5 1.5 0 0 1 11 3.5V5"/></svg>';
        }, 1500);
      });
    });

    const nameInput = document.getElementById('wizard-node-name');
    const saveBtn = document.getElementById('wizard-save-name');
    let savedName = nodeName;
    nameInput.addEventListener('input', () => {
      saveBtn.style.display = nameInput.value.trim() !== savedName ? 'inline-flex' : 'none';
    });
    nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveBtn.click(); });
    saveBtn.addEventListener('click', async () => {
      const name = nameInput.value.trim();
      if (!name) return;
      try {
        await api.setNodeName(name);
        savedName = name;
        saveBtn.style.display = 'none';
        saveBtn.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="var(--green)" stroke-width="2"><polyline points="3 8.5 6.5 12 13 4"/></svg>';
        setTimeout(() => {
          saveBtn.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 8.5 6.5 12 13 4"/></svg>';
        }, 1500);
      } catch { /* ignore */ }
    });
  } catch (err) {
    el.innerHTML = `<div class="wizard-identity"><div class="wizard-error">Failed to load node info: ${err.message}</div></div>`;
  }
}

// ─── Step 2: Choose Focus ─────────────────────────────
function renderFocus(el) {
  const stats = countStats();

  el.innerHTML = `
    <div class="wizard-focus">
      <h2>What should your node crawl?</h2>
      <p class="wizard-subtitle">Each topic you select adds seed URLs — starting points your crawler will visit and follow links from. The more topics you pick, the broader your index. Don't overthink it: you can add or remove seeds anytime from the Admin Dashboard.</p>

      <div class="wizard-category-groups" id="wizard-categories">
        ${CATEGORY_GROUPS.map(group => {
          const groupOpen = expandedGroups.has(group.id);
          const selInGroup = selectedSubsInGroup(group);
          const totInGroup = totalSubsInGroup(group);
          return `
          <div class="wizard-group ${groupOpen ? 'open' : ''} ${selInGroup > 0 ? 'has-selection' : ''}">
            <div class="wizard-group-header" data-group="${group.id}">
              <div class="wizard-group-left">
                <span class="wizard-group-chevron ${groupOpen ? 'open' : ''}">${icon('chevronDown', 14)}</span>
                ${icon(group.icon, 20)}
                <strong>${group.name}</strong>
                <span class="wizard-group-badge">${selInGroup}/${totInGroup}</span>
              </div>
              <button class="wizard-group-toggle" data-group-toggle="${group.id}" title="Select all in group">
                ${selInGroup === totInGroup ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            ${groupOpen ? `
            <div class="wizard-group-body">
              ${group.categories.map(cat => {
                const state = catSelectionState(cat);
                const isExpanded = expandedCategories.has(cat.id);
                const selectedCount = cat.subcategories.filter(s => selectedSubs.has(s.id)).length;
                const totalCount = cat.subcategories.length;
                return `
                <div class="wizard-category ${state !== 'none' ? 'selected' : ''} ${state === 'partial' ? 'partial' : ''} ${isExpanded ? 'expanded' : ''}" data-id="${cat.id}">
                  <div class="wizard-category-header" data-cat-id="${cat.id}">
                    <div class="wizard-category-icon">${icon(cat.icon, 22)}</div>
                    <div class="wizard-category-info">
                      <strong>${cat.name}</strong>
                      <span class="wizard-category-count">${selectedCount}/${totalCount} sub-topics</span>
                    </div>
                    <button class="wizard-cat-select-all" data-cat-toggle="${cat.id}" title="Select all sub-topics in ${cat.name}">
                      ${state === 'full' ? 'Deselect' : 'Select all'}
                    </button>
                    <div class="wizard-category-expand">
                      <span class="wizard-expand-chevron ${isExpanded ? 'open' : ''}">${icon('chevronDown', 16)}</span>
                    </div>
                  </div>
                  ${isExpanded ? `
                  <div class="wizard-category-body">
                    <div class="wizard-category-desc-row">${cat.desc}</div>
                    <div class="wizard-sub-pills">
                      ${cat.subcategories.map(sub => `
                        <button class="wizard-sub-pill ${selectedSubs.has(sub.id) ? 'selected' : ''}" data-sub-id="${sub.id}" title="${sub.seeds.map(s => s.label).join(', ')}">
                          ${selectedSubs.has(sub.id) ? '<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="2 6.5 4.5 9 10 3"/></svg>' : ''}
                          ${sub.name}
                          <span class="wizard-sub-pill-count">${sub.seeds.length}</span>
                        </button>
                      `).join('')}
                    </div>
                    <div class="wizard-sub-sources">
                      ${cat.subcategories.filter(s => selectedSubs.has(s.id)).flatMap(s => s.seeds.map(seed => seed.label)).join(' · ') || 'No sources selected'}
                    </div>
                  </div>
                  ` : ''}
                </div>
              `;
              }).join('')}
            </div>
            ` : ''}
          </div>
        `;
        }).join('')}
      </div>

      <div class="wizard-custom-seeds">
        <h3>Custom Seeds</h3>
        <p class="wizard-subtitle" style="margin-bottom:8px">Add any websites you want your node to crawl. One URL per line.</p>
        <textarea id="wizard-custom-textarea" rows="4" placeholder="https://example.com&#10;https://my-favorite-blog.org&#10;https://local-newspaper.com">${customSeeds}</textarea>
      </div>

      <div class="wizard-seed-total" id="wizard-seed-total">
        ${stats.total} seed${stats.total !== 1 ? 's' : ''} selected from ${stats.catCount} topic${stats.catCount !== 1 ? 's' : ''}
        ${stats.customCount > 0 ? ` + ${stats.customCount} custom` : ''}
      </div>

      ${stats.total > 0 ? `
      <div class="wizard-seed-accordion">
        <button class="wizard-seed-accordion-toggle" id="wizard-seed-toggle">
          <span>Review seed URLs (${stats.total})</span>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 6 8 10 12 6"/></svg>
        </button>
        <div class="wizard-seed-accordion-body" id="wizard-seed-list">
          ${renderSeedAccordionGrouped()}
        </div>
      </div>
      ` : ''}
    </div>
  `;

  // Group header click → toggle group accordion
  document.querySelectorAll('.wizard-group-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.wizard-group-toggle')) return;
      const groupId = header.dataset.group;
      if (expandedGroups.has(groupId)) {
        expandedGroups.delete(groupId);
      } else {
        expandedGroups.add(groupId);
      }
      renderFocus(el);
      renderNav();
    });
  });

  // Category header click → toggle category accordion
  document.querySelectorAll('.wizard-category-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.wizard-cat-select-all')) return;
      const catId = header.dataset.catId;
      if (expandedCategories.has(catId)) {
        expandedCategories.delete(catId);
      } else {
        expandedCategories.add(catId);
      }
      renderFocus(el);
      renderNav();
    });
  });

  // Select-all toggle per category
  document.querySelectorAll('.wizard-cat-select-all').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const catId = btn.dataset.catToggle;
      const cat = CATEGORIES.find(c => c.id === catId);
      if (!cat) return;
      const state = catSelectionState(cat);
      if (state === 'full') {
        cat.subcategories.forEach(s => selectedSubs.delete(s.id));
      } else {
        cat.subcategories.forEach(s => selectedSubs.add(s.id));
      }
      renderFocus(el);
      renderNav();
    });
  });

  // Subcategory pill click → toggle individual sub
  document.querySelectorAll('.wizard-sub-pill').forEach(pill => {
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      const subId = pill.dataset.subId;
      if (selectedSubs.has(subId)) selectedSubs.delete(subId);
      else selectedSubs.add(subId);
      renderFocus(el);
      renderNav();
    });
  });

  // Select-all toggle per group
  document.querySelectorAll('.wizard-group-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const groupId = btn.dataset.groupToggle;
      const group = CATEGORY_GROUPS.find(g => g.id === groupId);
      if (!group) return;
      const allSelected = selectedSubsInGroup(group) === totalSubsInGroup(group);
      group.categories.forEach(c => {
        c.subcategories.forEach(s => {
          if (allSelected) selectedSubs.delete(s.id);
          else selectedSubs.add(s.id);
        });
      });
      renderFocus(el);
      renderNav();
    });
  });

  // Custom seeds textarea
  const textarea = document.getElementById('wizard-custom-textarea');
  textarea.addEventListener('input', () => {
    customSeeds = textarea.value;
    const s = countStats();
    const totalEl = document.getElementById('wizard-seed-total');
    if (totalEl) {
      totalEl.textContent = `${s.total} seed${s.total !== 1 ? 's' : ''} selected from ${s.catCount} topic${s.catCount !== 1 ? 's' : ''}${s.customCount > 0 ? ` + ${s.customCount} custom` : ''}`;
    }
    renderNav();
  });

  // Seed accordion toggle
  const toggleBtn = document.getElementById('wizard-seed-toggle');
  const seedList = document.getElementById('wizard-seed-list');
  if (toggleBtn && seedList) {
    // Restore open state
    if (seedAccordionOpen) {
      seedList.classList.add('open');
      toggleBtn.classList.add('open');
    }
    toggleBtn.addEventListener('click', () => {
      seedAccordionOpen = !seedAccordionOpen;
      seedList.classList.toggle('open', seedAccordionOpen);
      toggleBtn.classList.toggle('open', seedAccordionOpen);
    });
  }

  // Remove individual seeds — update in place without full re-render
  document.querySelectorAll('.wizard-seed-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = btn.dataset.removeUrl;
      removedSeeds.add(url);
      // Remove the item from DOM directly
      const item = btn.closest('.wizard-seed-item');
      if (item) item.remove();
      // Update totals
      const stats = countStats();
      const totalEl = document.getElementById('wizard-seed-total');
      if (totalEl) {
        totalEl.textContent = `${stats.total} seed${stats.total !== 1 ? 's' : ''} selected from ${stats.catCount} topic${stats.catCount !== 1 ? 's' : ''}${stats.customCount > 0 ? ` + ${stats.customCount} custom` : ''}`;
      }
      const toggleEl = document.getElementById('wizard-seed-toggle');
      if (toggleEl) {
        toggleEl.querySelector('span').textContent = `Review seed URLs (${stats.total})`;
      }
      // Remove empty group labels
      document.querySelectorAll('.wizard-seed-group-label').forEach(label => {
        let next = label.nextElementSibling;
        if (!next || next.classList.contains('wizard-seed-group-label')) label.remove();
      });
      renderNav();
    });
  });
}

function renderSeedAccordionGrouped() {
  const sections = [];
  for (const cat of CATEGORIES) {
    const activeSubs = cat.subcategories.filter(s => selectedSubs.has(s.id));
    if (activeSubs.length === 0) continue;
    const seedItems = activeSubs.flatMap(sub =>
      sub.seeds.filter(s => !removedSeeds.has(s.url)).map(s => `
        <div class="wizard-seed-item" data-seed-url="${s.url.replace(/"/g, '&quot;')}">
          <span class="wizard-seed-url">${s.label} — ${s.url}</span>
          <button class="wizard-seed-remove" data-remove-url="${s.url.replace(/"/g, '&quot;')}" title="Remove">&times;</button>
        </div>
      `)
    );
    if (seedItems.length > 0) {
      sections.push(`
        <div class="wizard-seed-group-label">${cat.name}</div>
        ${seedItems.join('')}
      `);
    }
  }
  // Custom seeds
  const custom = customSeeds.split('\n').map(s => s.trim()).filter(s => (s.startsWith('http://') || s.startsWith('https://')) && !removedSeeds.has(s));
  if (custom.length > 0) {
    sections.push(`
      <div class="wizard-seed-group-label">Custom</div>
      ${custom.map(url => `
        <div class="wizard-seed-item" data-seed-url="${url.replace(/"/g, '&quot;')}">
          <span class="wizard-seed-url">${url}</span>
          <button class="wizard-seed-remove" data-remove-url="${url.replace(/"/g, '&quot;')}" title="Remove">&times;</button>
        </div>
      `).join('')}
    `);
  }
  return sections.join('');
}

// ─── Step 3: Tune Settings ────────────────────────────
async function renderSettings(el) {
  try {
    const info = await api.crawlerStatus();
    if (info) {
      if (info.max_depth) settings.depth = Math.min(5, Math.max(1, info.max_depth));
      if (info.workers) settings.workers = Math.min(8, Math.max(1, info.workers));
    }
  } catch { /* use defaults */ }
  const est = Math.round(growthEstimate());
  const seeds = getAllSelectedSeeds();

  el.innerHTML = `
    <div class="wizard-settings">
      <h2>Crawl Settings</h2>
      <p class="wizard-subtitle"><strong>Depth</strong> controls how many links deep the crawler follows from each seed. <strong>Workers</strong> is the number of parallel crawlers. Higher values mean faster crawling but use more CPU, memory, and bandwidth. These are preview-only — to change them permanently, edit your node config or use the Admin Dashboard.</p>

      <div class="wizard-setting">
        <label>Crawl Depth: <strong id="depth-val">${settings.depth}</strong></label>
        <input type="range" min="1" max="5" value="${settings.depth}" id="wizard-depth">
        <span class="wizard-setting-desc" id="depth-desc">${DEPTH_DESCRIPTIONS[settings.depth]}</span>
      </div>

      <div class="wizard-setting">
        <label>Workers: <strong id="workers-val">${settings.workers}</strong></label>
        <input type="range" min="1" max="8" value="${settings.workers}" id="wizard-workers">
        <span class="wizard-setting-desc" id="workers-desc">${workersDesc(settings.workers)}</span>
      </div>

      <div class="wizard-estimate-card">
        <div class="wizard-estimate-label">Growth Estimate</div>
        <div class="wizard-estimate-value">~${est.toLocaleString()} pages</div>
        <div class="wizard-estimate-sub">With ${seeds.length} seeds at depth ${settings.depth} using ${settings.workers} workers, in the first hour</div>
      </div>

      <div class="wizard-info-note">
        ${icon('alertTriangle', 16)} These sliders show your current config but don't change it. To modify crawl depth or workers permanently, update your config file or use the Admin Dashboard after setup.
      </div>
    </div>
  `;

  document.getElementById('wizard-depth').addEventListener('input', e => {
    settings.depth = parseInt(e.target.value);
    document.getElementById('depth-val').textContent = settings.depth;
    document.getElementById('depth-desc').textContent = DEPTH_DESCRIPTIONS[settings.depth];
    updateEstimate();
  });

  document.getElementById('wizard-workers').addEventListener('input', e => {
    settings.workers = parseInt(e.target.value);
    document.getElementById('workers-val').textContent = settings.workers;
    document.getElementById('workers-desc').textContent = workersDesc(settings.workers);
    updateEstimate();
  });

  function updateEstimate() {
    const est = Math.round(growthEstimate());
    const s = getAllSelectedSeeds();
    const valEl = document.querySelector('.wizard-estimate-value');
    const subEl = document.querySelector('.wizard-estimate-sub');
    if (valEl) valEl.textContent = `~${est.toLocaleString()} pages`;
    if (subEl) subEl.textContent = `With ${s.length} seeds at depth ${settings.depth} using ${settings.workers} workers, in the first hour`;
  }
}

function workersDesc(n) {
  if (n <= 2) return 'Low — minimal resource usage';
  if (n <= 4) return 'Moderate — balanced performance';
  if (n <= 6) return 'High — faster crawl, more CPU/memory';
  return 'Maximum — heavy resource usage';
}

// ─── Step 4: Launch & Watch ───────────────────────────
async function renderLaunch(el) {
  const seeds = getAllSelectedSeeds();
  const topicNames = CATEGORIES.filter(c => c.subcategories.some(s => selectedSubs.has(s.id))).map(c => c.name);

  // No seeds selected — show alert and finish wizard
  if (seeds.length === 0) {
    localStorage.setItem('doogle_wizard_dismissed', 'true');
    el.innerHTML = `
      <div class="wizard-launch">
        <h2>Setup Complete</h2>
        <p class="wizard-subtitle" style="margin-bottom:12px">Your node is configured but you haven't added any seed URLs yet. Remember to add seeds from the Actions panel in the Admin Dashboard so the crawler has pages to visit.</p>
        <div class="wizard-launch-actions" style="display:flex">
          <button class="btn btn-primary" id="wizard-go-admin">Go to Admin</button>
          <button class="btn" id="wizard-go-search">Go to Search</button>
        </div>
      </div>
    `;
    setTimeout(() => {
      document.getElementById('wizard-go-admin')?.addEventListener('click', () => { window.location.hash = '#/admin/actions'; });
      document.getElementById('wizard-go-search')?.addEventListener('click', () => { window.location.hash = '#/search'; });
    }, 0);
    return;
  }

  el.innerHTML = `
    <div class="wizard-launch">
      <h2>Crawling</h2>
      <p class="wizard-subtitle" style="margin-bottom:12px">Your seed URLs are being submitted to the crawl queue. The crawler will visit each page, extract content and links, score quality, and add good pages to your search index. This runs in the background — you can start searching as soon as the first pages are indexed.</p>
      ${topicNames.length > 0 ? `<p class="wizard-launch-topics">Specializing in: <strong>${topicNames.join(', ')}</strong></p>` : ''}
      <div class="wizard-launch-status" id="wizard-launch-status">Adding ${seeds.length} seeds to crawl queue...</div>
      <div class="wizard-progress-bar"><div class="wizard-progress-fill" id="wizard-progress-fill" style="width:0%"></div></div>
      <div class="wizard-counters" id="wizard-counters">
        <div class="wizard-counter">
          <div class="wizard-counter-value" id="wc-crawled">0</div>
          <div class="wizard-counter-label">Crawled</div>
        </div>
        <div class="wizard-counter">
          <div class="wizard-counter-value" id="wc-indexed">0</div>
          <div class="wizard-counter-label">Indexed</div>
        </div>
        <div class="wizard-counter">
          <div class="wizard-counter-value" id="wc-queue">0</div>
          <div class="wizard-counter-label">In Queue</div>
        </div>
      </div>
      <p class="wizard-launch-note" id="wizard-launch-note" style="display:none">
        These seeds are just a starting point — the crawler will discover thousands more pages by following links.
        Over time some sites will grow, others will go stale or disappear. You can always add new seeds,
        remove old ones, and reshape your index from the Admin Dashboard. Your node evolves with the web.
      </p>
      <div class="wizard-launch-actions" id="wizard-launch-actions" style="display:none">
        <button class="btn btn-primary" id="wizard-go-search">Go to Search</button>
        <a href="#/admin" class="wizard-admin-link">View Admin Dashboard</a>
      </div>
    </div>
  `;

  try {
    await api.crawlBatch(seeds);
  } catch {
    for (const url of seeds) {
      try { await api.addSeed(url); } catch { /* skip */ }
    }
  }

  const statusEl = document.getElementById('wizard-launch-status');
  if (statusEl) statusEl.textContent = 'Crawling...';

  let ready = false;
  pollInterval = setInterval(async () => {
    try {
      const s = await api.status();
      const crawledEl = document.getElementById('wc-crawled');
      const indexedEl = document.getElementById('wc-indexed');
      const queueEl = document.getElementById('wc-queue');
      const fillEl = document.getElementById('wizard-progress-fill');
      const statusEl = document.getElementById('wizard-launch-status');
      const actionsEl = document.getElementById('wizard-launch-actions');

      if (crawledEl) crawledEl.textContent = (s.crawled_urls || 0).toLocaleString();
      if (indexedEl) indexedEl.textContent = (s.indexed_docs || 0).toLocaleString();
      if (queueEl) queueEl.textContent = (s.urls_in_queue || 0).toLocaleString();

      const pct = seeds.length > 0 ? Math.min(100, Math.round(((s.crawled_urls || 0) / seeds.length) * 100)) : 0;
      if (fillEl) fillEl.style.width = pct + '%';

      if (s.indexed_docs > 0 && !ready) {
        ready = true;
        if (statusEl) statusEl.textContent = 'Your node is ready!';
        if (actionsEl) actionsEl.style.display = 'flex';
        const noteEl = document.getElementById('wizard-launch-note');
        if (noteEl) noteEl.style.display = 'block';
      }
    } catch { /* ignore polling errors */ }
  }, 2000);

  window._pageInterval = pollInterval;

  setTimeout(() => {
    const goBtn = document.getElementById('wizard-go-search');
    if (goBtn) {
      goBtn.addEventListener('click', () => {
        localStorage.setItem('doogle_wizard_dismissed', 'true');
        window.location.hash = '#/search';
      });
    }
  }, 0);
}
