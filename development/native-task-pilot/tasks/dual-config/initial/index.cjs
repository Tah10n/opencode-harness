function configure(mode){if(!['compact','pretty'].includes(mode))throw new RangeError('Invalid mode');return {mode,indent:mode==='pretty'?2:0};}module.exports=configure;
