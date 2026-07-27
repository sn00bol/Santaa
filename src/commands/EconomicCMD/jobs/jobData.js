const { CURRENCY_EMOJI } = require('../../Utils/config');

const jobs = [
  {
    id: 'farmer',
    name: 'Farmer',
    icon: '👨‍🌾',
    description: 'Become an Asian guy and farmer stuff. Grow rice, argue with chickens, and question your life choices at 5 AM.',
    requiredWorkCount: 0,
    totalShiftsRequiredToUnlock: 0,
    shiftsRequiredPerDay: 1,
    timeBetweenShiftsMinutes: 20,
    salary: 41,
    welcomeText: ['A steady hand and a sunny field... mostly mosquitoes though.']
  },
  {
    id: 'fisher',
    name: 'Fisher',
    icon: '🎣',
    description: 'Cast a line and wait for luck to bite. Or just wait. Mostly wait. Sometimes a boot.',
    requiredWorkCount: 3,
    totalShiftsRequiredToUnlock: 3,
    shiftsRequiredPerDay: 1,
    timeBetweenShiftsMinutes: 70,
    salary: 72,
    welcomeText: ['The river never gives up its secrets easily... probably because it hates you.']
  },
  {
    id: 'miner',
    name: 'Miner',
    icon: '⛏️',
    description: 'Dig deeper for unique treasures. Like diamonds. Or existential dread. 50/50 really.',
    requiredWorkCount: 6,
    totalShiftsRequiredToUnlock: 6,
    shiftsRequiredPerDay: 2,
    timeBetweenShiftsMinutes: 150,
    salary: 100,
    welcomeText: ['Every chip of stone could lead to gold. Or a cave-in. Stay positive!']
  },
  {
    id: 'cook',
    name: 'Cook',
    icon: '👨‍🍳',
    description: 'Serve hot meals and quick energy. Burn everything and call it "charred artisanal".',
    requiredWorkCount: 9,
    totalShiftsRequiredToUnlock: 9,
    shiftsRequiredPerDay: 2,
    timeBetweenShiftsMinutes: 210,
    salary: 150,
    welcomeText: ['The kitchen is full of pressure and flavor... mostly pressure and smoke alarms.']
  },
  {
    id: 'engineer',
    name: 'Engineer',
    icon: '🛠️',
    description: 'Design and build amazing things. Then debug why it explodes at 3 AM.',
    requiredWorkCount: 12,
    totalShiftsRequiredToUnlock: 12,
    shiftsRequiredPerDay: 3,
    timeBetweenShiftsMinutes: 300,
    salary: 200,
    welcomeText: ['The blueprint of success is in your hands. The duct tape is in the drawer.']
  },
  {
    id: 'doctor',
    name: 'Doctor',
    icon: '🩺',
    description: 'Heal the sick, prescribe questionable medicine, and Google symptoms like everyone else.',
    requiredWorkCount: 18,
    totalShiftsRequiredToUnlock: 18,
    shiftsRequiredPerDay: 3,
    timeBetweenShiftsMinutes: 420,
    salary: 280,
    welcomeText: ['Take two aspirin and call me when the game stops crashing.']
  },
  {
    id: 'artist',
    name: 'Artist',
    icon: '🎨',
    description: 'Create beautiful masterpieces. Then sell your soul for likes and overpriced coffee.',
    requiredWorkCount: 24,
    totalShiftsRequiredToUnlock: 24,
    shiftsRequiredPerDay: 2,
    timeBetweenShiftsMinutes: 360,
    salary: 175,
    welcomeText: ['Starving artist? Nah. Just emotionally starving.']
  },
  {
    id: 'pilot',
    name: 'Pilot',
    icon: '✈️',
    description: 'Fly planes, impress people, and try not to think about the tiny snacks budget.',
    requiredWorkCount: 30,
    totalShiftsRequiredToUnlock: 30,
    shiftsRequiredPerDay: 3,
    timeBetweenShiftsMinutes: 480,
    salary: 450,
    welcomeText: ['Clear skies and smoother landings than your dating history.']
  },
  {
    id: 'influencer',
    name: 'Influencer',
    icon: '📱',
    description: 'Pose for photos, sell garbage to strangers, and cry in your Lambo (that you rented).',
    requiredWorkCount: 36,
    totalShiftsRequiredToUnlock: 36,
    shiftsRequiredPerDay: 4,
    timeBetweenShiftsMinutes: 180,
    salary: 320,
    welcomeText: ['Don\'t forget to like, comment, subscribe, and question your entire existence.']
  },
  {
    id: 'astronaut',
    name: 'Astronaut',
    icon: '🧑‍🚀',
    description: 'Go to space. Float around. Realize Earth problems followed you 400km up.',
    requiredWorkCount: 45,
    totalShiftsRequiredToUnlock: 45,
    shiftsRequiredPerDay: 2,
    timeBetweenShiftsMinutes: 720,
    salary: 680,
    welcomeText: ['One small step for man, one giant leap for your student loans.']
  },
  {
    id: 'ceo',
    name: 'CEO',
    icon: '💼',
    description: 'Make big decisions, attend meetings, and blame the interns for everything.',
    requiredWorkCount: 60,
    totalShiftsRequiredToUnlock: 60,
    shiftsRequiredPerDay: 5,
    timeBetweenShiftsMinutes: 90,
    salary: 1250,
    welcomeText: ['You\'re not late. You\'re fashionably in charge.']
  },
  {
    id: 'rockstar',
    name: 'Rockstar',
    icon: '🎸',
    description: 'Shred on stage, trash hotel rooms, and wonder why your voice sounds like a dying walrus at 35.',
    requiredWorkCount: 75,
    totalShiftsRequiredToUnlock: 75,
    shiftsRequiredPerDay: 3,
    timeBetweenShiftsMinutes: 240,
    salary: 890,
    welcomeText: ['Welcome to the big leagues. Try not to die of excess before level 100.']
  }
];

// some function seem not necessary to change
function getJobById(id) {
  return jobs.find(job => job.id === id) || null;
}

function getJobByIdentifier(identifier) {
  if (!identifier) return null;
  const normalized = String(identifier).trim().toLowerCase();
  return jobs.find(job => job.id === normalized || job.name.toLowerCase() === normalized) || null;
}

function getAvailableJobs(workCount = Number.POSITIVE_INFINITY) {
  return jobs
    .filter(job => job.requiredWorkCount <= workCount)
    .sort((a, b) => a.salary - b.salary || a.name.localeCompare(b.name));
}

function getSortedJobs() {
  return [...jobs].sort((a, b) => a.salary - b.salary || a.name.localeCompare(b.name));
}

function getJobCooldownMs(job) {
  const minutes = Number(job?.timeBetweenShiftsMinutes || 0);
  return minutes > 0 ? minutes * 60 * 1000 : 0;
}

function getJobUnlockStatus(job, totalCompletedWorkCount = 0) {
  if (!job) return { unlocked: false, reason: 'Job not found.' };
  const requiredUnlocks = Number(job.totalShiftsRequiredToUnlock ?? job.requiredWorkCount ?? 0);
  const unlocked = Number(totalCompletedWorkCount) >= requiredUnlocks;
  return {
    unlocked,
    requiredUnlocks,
    reason: unlocked ? 'Unlocked' : `Need ${Math.max(0, requiredUnlocks - Number(totalCompletedWorkCount))} more completed shifts.`
  };
}

function formatJobSummary(job, totalCompletedWorkCount = 0) {
  if (!job) return 'Job not found.';
  const unlockStatus = getJobUnlockStatus(job, totalCompletedWorkCount);
  const lockIcon = unlockStatus.unlocked ? ':white_check_mark:' : ':x:';
  const shiftCooldown = job.timeBetweenShiftsMinutes ? `${job.timeBetweenShiftsMinutes}m` : 'N/A';

  return [
    `${lockIcon} **${job.name}**`,
    `• **Shifts Required:** \`${job.shiftsRequiredPerDay ?? 1} per day\``,
    `• ${CURRENCY_EMOJI} **Salary:** \`${job.salary}\` / shift`,
    `• **Cooldown:** \`${shiftCooldown}\``,
    `• **Required To Unlock:** \`${job.totalShiftsRequiredToUnlock ?? job.requiredWorkCount ?? 0} total shifts\``,
    `-# Status: ${unlockStatus.reason}`
  ].join('\n');
}

module.exports = {
  jobs,
  getJobById,
  getJobByIdentifier,
  getAvailableJobs,
  getSortedJobs,
  getJobCooldownMs,
  getJobUnlockStatus,
  formatJobSummary
};
