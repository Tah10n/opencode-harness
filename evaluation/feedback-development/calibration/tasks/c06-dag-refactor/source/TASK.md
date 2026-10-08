Refactor the duplicated planning algorithms used by preview and runJobs into
src/planner.mjs exporting planJobs(jobs,options). Export planJobs from index.mjs.
Both entrypoints must call this exported planner once with the original jobs
and options. Planning, normalization, dependency validation and resource packing
must have one shared implementation; do not retain an unused copied planner.
This is a behavioral-preservation refactor, including asynchronous execution.

The preserved contract is complete here. Jobs is an array of {id,needs=[],
slots=1,seconds=1}; IDs/nonempty dependency names are strings, dependencies are
deduplicated, IDs unique and every dependency names a job. Type errors throw
TypeError; duplicate/missing dependencies and cycles throw Error. capacity
defaults to 2 and is an integer 1..8. slots is a positive integer <=capacity;
seconds is finite and positive. Invalid resources/capacity throw RangeError.
Inputs and nested arrays stay unchanged and are never retained by returned plans.

At each wave, collect not-yet-completed jobs whose dependencies completed in
earlier waves, sort by ordinary lexical ID order, then greedily add each job if
its slots fit remaining capacity. Skip ready jobs that do not fit; reconsider
them next wave. Only after choosing the wave mark its jobs completed. A wave
with no eligible job while work remains means a cycle. Return {waves,order,
estimated}; order flattens waves and estimated sums each wave's maximum seconds.
Empty jobs returns {waves:[],order:[],estimated:0}.

preview returns that plan; formatPreview retains `wave N: id, id` lines.
runJobs(jobs,runner,options) executes each wave concurrently, waits for all its
jobs to settle, and starts the next wave only if all succeeded. Invoke runner(id)
once per planned ID. On success return {plan,results:[{id,value}]} in planned
order regardless of completion order. On failure throw the first failed job's
reason in that wave's planned order after the whole wave settles; start no next
wave. Preserve synchronous-throw handling. Do not add retries or dependencies.
The exported planner is a substitution seam: replacing it before loading either
entrypoint must change both preview and execution's plan. Run npm test.
