// PROTOTYPE fixture generator — throwaway, see README.md
//
// Reads the real math-reforged workspace (293 points / 340 hyperedges) and the real
// derivon CLI, and precomputes every (known-set preset x target) route so the browser
// prototype can answer instantly without a solver.
//
// Run:  node prototypes/entry-orientation/generate-fixtures.mjs

import { execFile } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const source = resolve(repoRoot, '../math-reforged');
const outDir = join(here, 'fixtures');

const workspace = JSON.parse(readFileSync(join(source, '.derivon/workspace.json'), 'utf8'));
const points = workspace.graph.points;
const hyperedges = workspace.graph.hyperedges;
const graph = { schema: 'derivon.graph/v1', points, hyperedges };
const graphJson = JSON.stringify(graph);

// ---------------------------------------------------------------------------
// Hand-made tags. The real graph has NO tags: this table is the prototype's
// proposal, not data. If the atlas variant wins, someone has to decide who
// authors these and whether they belong in the protocol.
// ---------------------------------------------------------------------------
const TAG_RULES = [
  ['概率与统计', /probab|random|sample-|expected-value|variance|distribution|covarian|correlat|kalman|estimator|monte-carlo|law-of-large|central-limit|standard-deviation|conditional/],
  ['数值计算', /iteration|krylov|precondition|jacobi-method|gauss-seidel|incomplete-lu|conjugate-gradient|arnoldi|lanczos|power-method|qr-eigenvalue|givens|floating-point|partial-pivoting|sparse|fill-in|flop|condition-number|spectral-radius|stationary-linear/],
  ['应用与网络模型', /graph|incidence|spanning|kirchhoff|laplacian|network|finite-difference|stiffness|markov|stationary-distribution|perron|leslie|leontief|linear-program|simplex|interior-point|geometric-series|hill-cipher|modular|finite-field|homogeneous-coord|projective/],
  ['复数与 Fourier', /complex|fourier|roots-of-unity|hermitian|unitary-matrix|skew-hermitian|normal-matrix|circulant|legendre|chebyshev|hilbert-space|parseval|function-inner-product/],
  ['SVD 与数据', /singular|svd|eckart|truncated|effective-rank|polar-decomposition|matrix-2-norm|principal-component|explained-variance|data-centering|rayleigh/],
  ['内积与正交', /inner-product|orthogon|orthonormal|norm|adjoint|self-adjoint|isometry|projection|gram-schmidt|qr-|least-squares|normal-equations|reflection|fredholm|cauchy-schwarz|dot-product|euclidean|angle|triangle-inequality|positive-definite|positive-semidefinite|cholesky|spectral-theorem|ata-nullspace|blue|best-linear/],
  ['特征值与相似', /eigen|characteristic|diagonaliz|similar|multiplicity|jordan|nilpotent|triangular-diagonal|invariant-subspace|cayley|gershgorin|schur|matrix-exponential|dynamics|stability|minimal-polynomial|quadratic-form|trace/],
  ['行列式', /determinant|cofactor|adjugate|cramer|permutation-parity|leibniz|cross-product|scalar-triple/],
  ['四个基本子空间', /column-space|row-space|nullspace|null-range|rank|free-variable|special-solution|particular-solution|complete-linear-system|echelon|pivot-column|fundamental-subspaces|left-nullity|basis-cardinality/],
  ['矩阵与消元', /matrix|elimination|pivot|lu-|ldu|ldlt|row-operation|augmented|substitution|linear-system|inverse|singular-matrix|identity|transpose|symmetric|block|schur-complement|band|diagonally-dominant|outer-product|sherman/],
  ['抽象向量空间', /field|tuple|vector-space|subspace|span|independence|basis|dimension|direct-sum|quotient|dual|coordinate|linear-combination|finite-dimensional|polynomial|tensor|bilinear|alternating|affine|isomorphism|linear-map|operator|change-of-basis|surject|inject|invertible/],
];

function tagOf(id) {
  for (const [tag, pattern] of TAG_RULES) if (pattern.test(id)) return tag;
  return '其他';
}

// ---------------------------------------------------------------------------
// Known-set presets. Every preset must contain the graph's two roots
// (foundation-fields / finite-tuple), otherwise nothing is derivable: this
// graph has no empty-tail hyperedges.
// ---------------------------------------------------------------------------
const ROOTS = ['foundation-fields', 'finite-tuple'];
const PRESETS = [
  {
    id: 'zero',
    label: '零基础',
    blurb: '只承认「数域」和「有限有序组」。图上什么都得从头推。',
    points: [...ROOTS],
  },
  {
    id: 'strang',
    label: '工科一学期：会算矩阵',
    blurb: '消元、矩阵乘法、逆、行列式都会算，但没证明过任何东西。',
    points: [...ROOTS, 'matrix-array', 'matrix-vector-product', 'linear-system', 'homogeneous-linear-system',
      'matrix-addition', 'matrix-scalar-multiplication', 'matrix-multiplication', 'identity-matrix',
      'inverse-matrix', 'invertible-matrix', 'matrix-transpose', 'row-operation', 'pivot',
      'gaussian-elimination', 'augmented-matrix', 'upper-triangular-matrix', 'back-substitution',
      'determinant', 'cofactor-expansion', 'dot-product', 'euclidean-norm'],
  },
  {
    id: 'axler',
    label: '数学系：学过抽象线代',
    blurb: '向量空间、线性映射、特征值都以定义和证明的方式学过，但没碰过数值和矩阵算法。',
    points: [...ROOTS, 'vector-space', 'subspace', 'span', 'independence', 'basis', 'dimension',
      'direct-sum', 'linear-combination', 'finite-dimensional', 'coordinate-space', 'linear-map',
      'null-range', 'range', 'injective-surjective', 'surjective', 'invertible', 'rank-nullity',
      'matrix', 'change-of-basis', 'isomorphism', 'operator', 'eigen', 'eigenvector', 'polynomial'],
  },
  {
    id: 'stats',
    label: '数据方向：学过概率，线代忘光了',
    blurb: '期望方差协方差都熟，线代只剩「矩阵是个表格」。',
    points: [...ROOTS, 'probability-distribution', 'random-variable', 'expected-value', 'sample-mean',
      'sample-variance', 'population-variance', 'probability-density', 'cumulative-distribution',
      'normal-distribution', 'covariance', 'conditional-probability', 'standard-deviation',
      'matrix-array', 'matrix-vector-product'],
  },
];

const known = new Set(points.map((p) => p.id));
for (const preset of PRESETS) {
  const missing = preset.points.filter((id) => !known.has(id));
  if (missing.length) throw new Error(`preset ${preset.id} references unknown points: ${missing.join(', ')}`);
}

// ---------------------------------------------------------------------------
// Solve every preset x target with the real CLI.
// ---------------------------------------------------------------------------
function solve(startIds, targetId) {
  const args = ['query', 'route'];
  for (const id of startIds) args.push('--start', id);
  args.push('--target', targetId);
  return new Promise((done) => {
    const child = execFile('derivon', args, { maxBuffer: 32 * 1024 * 1024 }, (error, stdout) => {
      if (error) return done({ reachable: false, error: String(error).slice(0, 200) });
      const parsed = JSON.parse(stdout);
      done({
        reachable: parsed.reachable,
        cost: parsed.cost,
        provenOptimal: parsed.provenOptimal,
        millis: parsed.millis,
        order: parsed.executableOrder,
        pointIds: parsed.pointIds,
      });
    });
    child.stdin.end(graphJson);
  });
}

async function pool(tasks, size) {
  const results = new Array(tasks.length);
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < tasks.length) {
      const index = next++;
      results[index] = await tasks[index]();
      if (index % 100 === 0) process.stdout.write(`  ${index}/${tasks.length}\n`);
    }
  }));
  return results;
}

const jobs = [];
for (const preset of PRESETS) {
  for (const point of points) jobs.push({ preset: preset.id, target: point.id });
}
console.log(`solving ${jobs.length} routes with the real derivon CLI...`);
const started = Date.now();
const solved = await pool(
  jobs.map((job) => () => solve(PRESETS.find((p) => p.id === job.preset).points, job.target)),
  8,
);
console.log(`done in ${((Date.now() - started) / 1000).toFixed(1)}s`);

const routes = {};
for (const preset of PRESETS) routes[preset.id] = {};
jobs.forEach((job, index) => { routes[job.preset][job.target] = solved[index]; });

// ---------------------------------------------------------------------------
// Documents: the real markdown, so the reading experience is not lorem ipsum.
// ---------------------------------------------------------------------------
const documents = {};
for (const item of [...points, ...hyperedges]) {
  const dir = item.data?.document;
  if (!dir) continue;
  const path = join(source, dir, 'document.md');
  if (existsSync(path)) documents[item.id] = readFileSync(path, 'utf8');
}

const edgeLabel = new Map(hyperedges.map((edge) => [edge.id, edge]));
const labelOf = new Map(points.map((point) => [point.id, point.data?.label ?? point.id]));

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'graph.json'), JSON.stringify({
  points: points.map((point) => ({
    id: point.id,
    label: labelOf.get(point.id),
    tag: tagOf(point.id),
  })),
  hyperedges: hyperedges.map((edge) => ({
    id: edge.id,
    tails: edge.tails,
    head: edge.head,
    weight: edge.weight,
  })),
  presets: PRESETS,
}));
writeFileSync(join(outDir, 'routes.json'), JSON.stringify(routes));
writeFileSync(join(outDir, 'documents.json'), JSON.stringify(documents));

const tagCounts = {};
for (const point of points) tagCounts[tagOf(point.id)] = (tagCounts[tagOf(point.id)] ?? 0) + 1;
console.log('tags:', tagCounts);
for (const preset of PRESETS) {
  const entries = Object.values(routes[preset.id]);
  const reachable = entries.filter((entry) => entry.reachable).length;
  const costs = entries.filter((entry) => entry.reachable).map((entry) => entry.cost);
  console.log(`${preset.id}: reachable ${reachable}/${entries.length}, median steps ` +
    `${median(entries.filter((e) => e.reachable).map((e) => e.order.length))}, median cost ${median(costs)}`);
}
console.log('edges without label doc:', hyperedges.filter((edge) => !documents[edge.id]).length, '/', edgeLabel.size);

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
