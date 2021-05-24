export const expandRange = (range: string): number[] =>
  range.split(/\s*,\s*/).reduce((range: number[], n) => {
    if (n.match(/-/)) {
      const [start, end] = n.split(/\s*-\s*/).map((n) => parseInt(n, 10));

      [...new Array(end - start + 1).keys()].forEach((n) =>
        range.push(start + n)
      );
    } else if (n.match(/^\d+$/)) {
      range.push(parseInt(n, 10));
    }

    return range;
  }, []);

export default expandRange;
