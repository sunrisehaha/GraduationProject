from heapq import heappop, heappush


def heuristic(a, b):
    """Use Manhattan distance for 4-direction grid movement."""
    return abs(a["x"] - b["x"]) + abs(a["y"] - b["y"])


def reconstruct_path(came_from, current):
    """Build the final path from end node back to start node."""
    path = [{"x": current[0], "y": current[1]}]

    while current in came_from:
        current = came_from[current]
        path.append({"x": current[0], "y": current[1]})

    path.reverse()
    return path


def find_path(start, end, obstacles=None, width=20, height=12):
    """Find a path on a 2D grid using A*."""
    if obstacles is None:
        obstacles = []

    start_pos = (start["x"], start["y"])
    end_pos = (end["x"], end["y"])
    obstacle_set = {(item["x"], item["y"]) for item in obstacles}

    def in_bounds(position):
        x, y = position
        return 0 <= x < width and 0 <= y < height

    if not in_bounds(start_pos) or not in_bounds(end_pos):
        return []

    if start_pos in obstacle_set or end_pos in obstacle_set:
        return []

    if start_pos == end_pos:
        return [{"x": start_pos[0], "y": start_pos[1]}]

    open_heap = []
    heappush(open_heap, (heuristic(start, end), 0, start_pos))

    came_from = {}
    g_score = {start_pos: 0}
    visited = set()
    directions = [(1, 0), (-1, 0), (0, 1), (0, -1)]

    while open_heap:
        _, current_cost, current = heappop(open_heap)

        if current in visited:
            continue

        visited.add(current)

        if current == end_pos:
            return reconstruct_path(came_from, current)

        for dx, dy in directions:
            neighbor = (current[0] + dx, current[1] + dy)

            if not in_bounds(neighbor) or neighbor in obstacle_set:
                continue

            tentative_g_score = current_cost + 1

            if tentative_g_score >= g_score.get(neighbor, float("inf")):
                continue

            came_from[neighbor] = current
            g_score[neighbor] = tentative_g_score
            priority = tentative_g_score + abs(neighbor[0] - end_pos[0]) + abs(neighbor[1] - end_pos[1])
            heappush(open_heap, (priority, tentative_g_score, neighbor))

    return []
