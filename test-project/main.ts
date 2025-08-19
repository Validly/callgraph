class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }

  multiply(a: number, b: number): number {
    return a * b;
  }
}

function createCalculator(): Calculator {
  return new Calculator();
}

function main() {
  const calc = createCalculator();
  const sum = calc.add(5, 3);
  const product = calc.multiply(sum, 2);
  console.log(`Result: ${product}`);
}

main();