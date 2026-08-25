const { EmbedBuilder } = require('discord.js');
const { getPaginationRow } = require('../Utils/NavigateManager');
const { jobs, getJobById, getJobByIdentifier, getAvailableJobs, getSortedJobs, getJobCooldownMs, getJobUnlockStatus, formatJobSummary } = require('./jobs/jobData');
const runJobMinigame = require('./jobs/minigameRunner');
const buildJobResultEmbed = require('./jobs/buildJobResultEmbed');
const { JobStart, JobSuccess, JobFail } = require('../Utils/misc');
const { checkWantedRestrictions } = require('../Utils/WantedLevel');

const cooldownConfig = require('../Utils/config');
const TEST_MONTH_WORK_REQUIREMENT = 10;
const TEST_FIRST_BONUS_RANGE = { min: 30, max: 40 };
const TEST_MONTH_PAY = 300;

function formatTimeLeft(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function getRandomText(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

module.exports = {
  name: 'job',
  description: 'The most feared word in the world... THE JOB!!!!',
  category: 'eco',
  usage: 'Zjob `help`/`work`/`list`/`choose`',
  async execute(message, args = []) {
    const { author } = message;
    const dbManager = message.client.db;

    const state = await dbManager.getJobState(author.id);
    const now = Date.now();

    const action = args[0] ? args[0].toLowerCase() : 'help';

    if (action === 'help') {
      const embed = new EmbedBuilder()
        .setTitle('Use this specific commands:')
        .addFields(
          { name: 'Zjob help', value: '-# display job usage information' },
          { name: 'Zjob work', value: '-# work your current job' },
          { name: 'Zjob list', value: '-# view all available careers' },
          { name: 'Zjob choose `job name`', value: '-# choose a new job' }
        );
      return message.channel.send({ embeds: [embed] });
    }


    if (action === 'list') {
      const orderedJobs = getSortedJobs();
      const itemsPerPage = 4;
      let currentPage = 0;

      const buildJobListEmbed = (page) => {
        const totalPages = Math.max(1, Math.ceil(orderedJobs.length / itemsPerPage));
        const start = page * itemsPerPage;
        const pageJobs = orderedJobs.slice(start, start + itemsPerPage);
        const jobOptions = pageJobs.map(job => formatJobSummary(job, Number(state.work_count || 0))).join('\n\n');

        return {
          embed: new EmbedBuilder()
            .setTitle('Available careers')
            .setDescription(jobOptions || 'No jobs available at the moment.')
            .setFooter({ text: `Page ${page + 1} of ${totalPages}` }),
          totalPages
        };
      };

      const initial = buildJobListEmbed(currentPage);
      const response = await message.channel.send({
        embeds: [initial.embed],
        components: initial.totalPages > 1 ? [getPaginationRow(currentPage, initial.totalPages)] : []
      });

      const collector = response.createMessageComponentCollector({ time: 60000 });

      collector.on('collect', async (i) => {
        if (i.user.id !== message.author.id) return i.reply({ content: 'Not your menu!', ephemeral: true });
        if (!i.isButton()) return;

        switch (i.customId) {
          case 'prev': currentPage--; break;
          case 'next': currentPage++; break;
          case 'first': currentPage = 0; break;
          case 'last': {
            const totalPages = Math.max(1, Math.ceil(orderedJobs.length / itemsPerPage));
            currentPage = Math.max(0, totalPages - 1);
            break;
          }
        }

        const result = buildJobListEmbed(currentPage);
        await i.update({
          embeds: [result.embed],
          components: result.totalPages > 1 ? [getPaginationRow(currentPage, result.totalPages)] : []
        });
      });

      collector.on('end', () => {
        response.edit({ components: [] }).catch(() => { });
      });

      return;
    }

    if (action === 'choose') {
      const wantedCheck = await checkWantedRestrictions(author.id, this.name, message.client, message);
      if (!wantedCheck.allowed) {
        if (!wantedCheck.handled && wantedCheck.message) message.reply(wantedCheck.message);
        return;
      }

      const targetJob = getJobByIdentifier(args[1]);
      if (!targetJob) {
        return message.reply('That job was not found. Use `Zjob list` to see the available careers.');
      }

      const unlockStatus = getJobUnlockStatus(targetJob, Number(state.work_count || 0));
      if (!unlockStatus.unlocked) {
        return message.reply(`You cannot choose **${targetJob.name}** yet. ${unlockStatus.reason}`);
      }

      await dbManager.updateJobProgress(author.id, {
        job_id: targetJob.id,
        work_count: 0,
        last_worked_at: 0,
        fired_at: 0,
        fired_until: 0,
        first_bonus_received: 0
      });

      return message.reply(`You chose **${targetJob.name}**! Your new job is ready.`);
    }

    if (action === 'work') {
      // continue with the work flow below
    } else if (action && action !== 'help' && action !== 'list' && action !== 'choose') {
      return message.reply('Unknown job action. Use `Zjob help` to see the available commands.');
    }

    if (state.fired_until > now) {
      const waitTime = state.fired_until - now;
      return message.reply(`You were fired and cannot work again for ${formatTimeLeft(waitTime)}.`);
    }

    const wantedCheck = await checkWantedRestrictions(author.id, this.name, message.client, message);
    if (!wantedCheck.allowed) {
      if (!wantedCheck.handled && wantedCheck.message) message.reply(wantedCheck.message);
      return;
    }

    const job = getJobById(state.job_id);
    if (!job) {
      return message.reply('Your saved job could not be found. Please try again later.');
    }

    const lastWorkedAt = Number(state.last_worked_at || 0);
    const jobCooldownMs = getJobCooldownMs(job);
    if (jobCooldownMs > 0 && lastWorkedAt && now - lastWorkedAt > jobCooldownMs) {
      await dbManager.updateJobProgress(author.id, {
        fired_at: now,
        fired_until: now + cooldownConfig.jobFirePenalty,
        work_count: Math.max(0, Number(state.work_count) - 1)
      });
      return message.reply('You were fired for missing work for too long. Take a short break and try again soon.');
    }

    const pay = job.salary;
    let bonus = 0;

    if (Number(state.work_count) + 1 >= TEST_MONTH_WORK_REQUIREMENT) {
      bonus += TEST_MONTH_PAY;
    }

    if (Number(state.first_bonus_received) === 0) {
      const firstBonus = Math.floor(Math.random() * (TEST_FIRST_BONUS_RANGE.max - TEST_FIRST_BONUS_RANGE.min + 1)) + TEST_FIRST_BONUS_RANGE.min;
      bonus += firstBonus;
    }

    const minigameResult = await runJobMinigame(message, dbManager, author.id);
    const shouldReward = Boolean(minigameResult.success);
    const failurePenalty = Math.floor(Math.random() * 20) + 10;
    const jobOutcomeText = shouldReward ? getRandomText(JobSuccess) : getRandomText(JobFail);
    const amountText = shouldReward ? `${pay + bonus}` : `${failurePenalty}`;

    if (shouldReward) {
      await dbManager.addMoney(author.id, pay + bonus, { trackEarning: true });
    } else {
      await dbManager.removeMoney(author.id, failurePenalty);
    }

    const nextWorkCount = Number(state.work_count) + 1;
    const nextFirstBonusReceived = Number(state.first_bonus_received) === 0 ? 1 : Number(state.first_bonus_received);

    await dbManager.updateJobProgress(author.id, {
      work_count: nextWorkCount,
      last_worked_at: now,
      fired_at: 0,
      fired_until: 0,
      first_bonus_received: nextFirstBonusReceived
    });

    const embed = buildJobResultEmbed({
      job,
      jobOutcomeText,
      amountText,
      shouldReward,
      minigameResult,
      nextWorkCount
    });

    message.channel.send({ embeds: [embed] });

    // Hook achievements for job work
    if (shouldReward) {
      const rpgManager = message.client.rpg;
      const achievementChecker = require('../../minigames/achievement/achievementChecker');
      const stats = await rpgManager.getStats(author.id);
      achievementChecker.checkJob(author.id, stats, { jobId: job.id, workCount: nextWorkCount }).catch(console.error);
    }
  }
};
