use std::collections::BTreeSet;

use derivon_core::{blocking_frontier, executable_order, solve, Budget, Cost, Graph, PointSet};
use serde::{Deserialize, Serialize};
use serde_json::Value;

const DEFAULT_MAX_NODES: u64 = 200_000;
const DEFAULT_MAX_MILLIS: u64 = 200;
const MAX_NODES: u64 = 2_000_000;
const MAX_MILLIS: u64 = 5_000;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDocument {
    pub schema: String,
    pub document: Value,
    pub graph: WorkspaceGraph,
    pub view: Value,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceGraph {
    pub points: Vec<WorkspacePoint>,
    pub hyperedges: Vec<WorkspaceHyperedge>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePoint {
    pub id: String,
    pub data: Value,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceHyperedge {
    pub id: String,
    pub weight: f64,
    pub tails: Vec<String>,
    pub head: String,
    pub data: Value,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolveBudget {
    pub max_nodes: u64,
    pub max_millis: u64,
}

impl Default for SolveBudget {
    fn default() -> Self {
        Self {
            max_nodes: DEFAULT_MAX_NODES,
            max_millis: DEFAULT_MAX_MILLIS,
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RouteRequest {
    pub workspace: WorkspaceDocument,
    pub start_point_ids: Vec<String>,
    pub target_point_id: String,
    #[serde(default)]
    pub budget: Option<SolveBudget>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RouteResponse {
    pub reachable: bool,
    pub hyperedge_ids: Vec<String>,
    pub executable_order: Vec<String>,
    pub point_ids: Vec<String>,
    pub cost: Option<f64>,
    pub lower: Option<f64>,
    pub upper: Option<f64>,
    pub proven_optimal: bool,
    pub nodes: u64,
    pub millis: u64,
    pub blocking_point_ids: Vec<String>,
    pub cycles: Vec<Vec<String>>,
}

fn scaled_cost(weight: f64, edge_id: &str) -> Result<Cost, String> {
    if !weight.is_finite() || weight < 0.0 {
        return Err(format!(
            "hyperedge `{edge_id}` weight must be a non-negative finite number"
        ));
    }
    let scaled = weight * 10.0;
    let rounded = scaled.round();
    if (scaled - rounded).abs() > 1e-9 {
        return Err(format!(
            "hyperedge `{edge_id}` weight must have at most one decimal place"
        ));
    }
    if rounded >= u64::MAX as f64 {
        return Err(format!("hyperedge `{edge_id}` weight is too large"));
    }
    Ok(Cost::from_units(rounded as u64))
}

fn build_graph(workspace: &WorkspaceDocument) -> Result<Graph, String> {
    let mut graph = Graph::new();
    for point in &workspace.graph.points {
        graph
            .add_point(&point.id, ())
            .map_err(|error| error.to_string())?;
    }
    for edge in &workspace.graph.hyperedges {
        let head = graph.point_id(&edge.head).ok_or_else(|| {
            format!(
                "hyperedge `{}` references unknown head `{}`",
                edge.id, edge.head
            )
        })?;
        let tails = edge
            .tails
            .iter()
            .map(|id| {
                graph.point_id(id).ok_or_else(|| {
                    format!("hyperedge `{}` references unknown tail `{id}`", edge.id)
                })
            })
            .collect::<Result<Vec<_>, _>>()?;
        graph
            .add_hyperedge(
                &edge.id,
                tails,
                head,
                scaled_cost(edge.weight, &edge.id)?,
                (),
            )
            .map_err(|error| error.to_string())?;
    }
    Ok(graph)
}

fn cost_value(cost: Cost) -> Option<f64> {
    cost.units().map(|units| units as f64 / 10.0)
}

fn point_name(graph: &Graph, point: derivon_core::PointId) -> String {
    graph
        .point(point)
        .expect("core returned a point from this graph")
        .name()
        .to_owned()
}

fn edge_name(graph: &Graph, edge: derivon_core::HyperedgeId) -> String {
    graph
        .hyperedge(edge)
        .expect("core returned an edge from this graph")
        .name()
        .to_owned()
}

pub fn solve_route(request: RouteRequest) -> Result<RouteResponse, String> {
    let graph = build_graph(&request.workspace)?;
    let start_ids = request
        .start_point_ids
        .iter()
        .map(|id| {
            graph
                .point_id(id)
                .ok_or_else(|| format!("unknown start point id `{id}`"))
        })
        .collect::<Result<Vec<_>, _>>()?;
    let start =
        PointSet::from_ids(&graph, start_ids.iter().copied()).map_err(|error| error.to_string())?;
    let target = graph
        .point_id(&request.target_point_id)
        .ok_or_else(|| format!("unknown target point id `{}`", request.target_point_id))?;
    let requested_budget = request.budget.unwrap_or_default();
    if requested_budget.max_nodes > MAX_NODES || requested_budget.max_millis > MAX_MILLIS {
        return Err(format!(
            "budget exceeds the application limit ({MAX_NODES} nodes, {MAX_MILLIS} ms)"
        ));
    }
    let solution = solve(
        &graph,
        &start,
        target,
        &Budget {
            max_nodes: requested_budget.max_nodes,
            max_millis: requested_budget.max_millis,
        },
    )
    .map_err(|error| error.to_string())?;

    if !solution.cost.is_finite() {
        let diagnosis = blocking_frontier(&graph, &start, target);
        return Ok(RouteResponse {
            reachable: false,
            hyperedge_ids: Vec::new(),
            executable_order: Vec::new(),
            point_ids: Vec::new(),
            cost: None,
            lower: None,
            upper: None,
            proven_optimal: solution.proven_optimal,
            nodes: solution.nodes,
            millis: solution.millis,
            blocking_point_ids: diagnosis
                .blocking
                .into_iter()
                .map(|point| point_name(&graph, point))
                .collect(),
            cycles: diagnosis
                .cycles
                .into_iter()
                .map(|cycle| {
                    cycle
                        .into_iter()
                        .map(|point| point_name(&graph, point))
                        .collect()
                })
                .collect(),
        });
    }

    let ordered = executable_order(&graph, &start, &solution.derivation)
        .map_err(|error| error.to_string())?;
    let mut points: BTreeSet<String> = request.start_point_ids.into_iter().collect();
    points.insert(request.target_point_id);
    for edge_id in &solution.derivation {
        let edge = graph
            .hyperedge(*edge_id)
            .expect("solution edge belongs to this graph");
        points.insert(point_name(&graph, edge.head()));
        for &tail in edge.tail() {
            points.insert(point_name(&graph, tail));
        }
    }

    Ok(RouteResponse {
        reachable: true,
        hyperedge_ids: solution
            .derivation
            .iter()
            .map(|&edge| edge_name(&graph, edge))
            .collect(),
        executable_order: ordered
            .into_iter()
            .map(|edge| edge_name(&graph, edge))
            .collect(),
        point_ids: points.into_iter().collect(),
        cost: cost_value(solution.cost),
        lower: cost_value(solution.lower),
        upper: cost_value(solution.upper),
        proven_optimal: solution.proven_optimal,
        nodes: solution.nodes,
        millis: solution.millis,
        blocking_point_ids: Vec::new(),
        cycles: Vec::new(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::{HashMap, HashSet};
    use std::fs;
    use std::path::{Path, PathBuf};

    fn workspace(points: &[&str], edges: &[(&str, f64, &[&str], &str)]) -> WorkspaceDocument {
        WorkspaceDocument {
            schema: "derivon.authoring/v0.2.0".to_owned(),
            document: serde_json::json!({}),
            graph: WorkspaceGraph {
                points: points
                    .iter()
                    .map(|id| WorkspacePoint {
                        id: (*id).to_owned(),
                        data: serde_json::json!({}),
                    })
                    .collect(),
                hyperedges: edges
                    .iter()
                    .map(|(id, weight, tails, head)| WorkspaceHyperedge {
                        id: (*id).to_owned(),
                        weight: *weight,
                        tails: tails.iter().map(|id| (*id).to_owned()).collect(),
                        head: (*head).to_owned(),
                        data: serde_json::json!({}),
                    })
                    .collect(),
            },
            view: serde_json::json!({}),
        }
    }

    fn request(workspace: WorkspaceDocument, starts: &[&str], target: &str) -> RouteRequest {
        RouteRequest {
            workspace,
            start_point_ids: starts.iter().map(|id| (*id).to_owned()).collect(),
            target_point_id: target.to_owned(),
            budget: None,
        }
    }

    #[test]
    fn adapter_preserves_joint_tails_empty_tails_parallel_edges_and_string_ids() {
        let document = workspace(
            &["a", "b", "goal"],
            &[
                ("given-a", 1.2, &[], "a"),
                ("joint", 2.3, &["a", "b"], "goal"),
                ("parallel", 3.0, &["a", "b"], "goal"),
            ],
        );
        let graph = build_graph(&document).unwrap();
        assert_eq!(graph.point_count(), 3);
        assert_eq!(graph.edge_count(), 3);
        assert!(graph
            .hyperedge(graph.hyperedge_id("given-a").unwrap())
            .unwrap()
            .tail()
            .is_empty());
        assert_eq!(
            graph
                .hyperedge(graph.hyperedge_id("joint").unwrap())
                .unwrap()
                .tail()
                .len(),
            2
        );
        assert_eq!(
            graph
                .hyperedge(graph.hyperedge_id("joint").unwrap())
                .unwrap()
                .weight()
                .units(),
            Some(23)
        );
        assert_eq!(
            graph
                .hyperedge(graph.hyperedge_id("parallel").unwrap())
                .unwrap()
                .name(),
            "parallel"
        );
    }

    #[test]
    fn adapter_rejects_invalid_weights_and_unknown_points() {
        assert!(build_graph(&workspace(&["a"], &[("bad", 1.25, &[], "a")])).is_err());
        assert!(build_graph(&workspace(&["a"], &[("bad", -1.0, &[], "a")])).is_err());
        assert!(build_graph(&workspace(&["a"], &[("bad", 1.0, &["missing"], "a")])).is_err());
        assert!(solve_route(request(workspace(&["a"], &[],), &["missing"], "a")).is_err());
    }

    #[test]
    fn reachable_route_is_executable_even_with_a_tiny_budget() {
        let mut query = request(
            workspace(
                &["a", "b", "goal"],
                &[
                    ("given-a", 1.0, &[], "a"),
                    ("joint", 2.0, &["a", "b"], "goal"),
                ],
            ),
            &["b"],
            "goal",
        );
        query.budget = Some(SolveBudget {
            max_nodes: 0,
            max_millis: 0,
        });
        let result = solve_route(query).unwrap();
        assert!(result.reachable);
        assert_eq!(result.executable_order, vec!["given-a", "joint"]);
        assert_eq!(result.cost, Some(3.0));
        assert!(result
            .hyperedge_ids
            .iter()
            .all(|id| id == "given-a" || id == "joint"));
    }

    #[test]
    fn unreachable_route_contains_blocking_cycle() {
        let result = solve_route(request(
            workspace(
                &["a", "b"],
                &[
                    ("a-from-b", 1.0, &["b"], "a"),
                    ("b-from-a", 1.0, &["a"], "b"),
                ],
            ),
            &[],
            "a",
        ))
        .unwrap();
        assert!(!result.reachable);
        assert_eq!(result.blocking_point_ids, vec!["a", "b"]);
        assert_eq!(result.cycles.len(), 1);
    }

    #[test]
    fn math_reforged_reaches_svd_in_executable_order() {
        let root = std::env::var_os("DERIVON_TEST_WORKSPACE")
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                Path::new(env!("CARGO_MANIFEST_DIR")).join("../../mindmaps/math-reforged")
            });
        let path = root.join(".derivon/workspace.json");
        let document: WorkspaceDocument =
            serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap();
        assert_eq!(document.graph.points.len(), 39);
        assert_eq!(document.graph.hyperedges.len(), 39);

        let edge_by_id: HashMap<_, _> = document
            .graph
            .hyperedges
            .iter()
            .map(|edge| (edge.id.as_str(), edge))
            .collect();
        let result = solve_route(RouteRequest {
            workspace: document.clone(),
            start_point_ids: Vec::new(),
            target_point_id: "svd".to_owned(),
            budget: None,
        })
        .unwrap();

        assert!(result.reachable);
        assert!(result
            .hyperedge_ids
            .iter()
            .all(|id| edge_by_id.contains_key(id.as_str())));
        let mut known: HashSet<String> = HashSet::new();
        for id in &result.executable_order {
            let edge = edge_by_id[id.as_str()];
            assert!(edge.tails.iter().all(|tail| known.contains(tail)));
            known.insert(edge.head.clone());
        }
        assert!(known.contains("svd"));
    }
}
