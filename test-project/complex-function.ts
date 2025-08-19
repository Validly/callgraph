import { formatNumber, isEven } from './utils.js';

export function processData(numbers: number[]): string {
  if (numbers.length === 0) {
    return "No data";
  }

  // Log input data as JSON
  console.log("Input data:", JSON.stringify(numbers));

  let result = "";
  let sum = 0;

  try {
    for (const num of numbers) {
      if (num < 0) {
        throw new Error("Negative number detected");
      }
      
      sum += num;
      
      if (num > 100) {
        console.log("Large number:", num);
      }
    }

    while (sum > 1000) {
      sum = Math.floor(sum / 2);
      console.log("Reducing sum:", sum);
    }

    // Check if sum is even using external utility
    const evenCheck = isEven(sum);
    if (evenCheck) {
      console.log("Sum is even");
    }

    switch (sum % 3) {
      case 0:
        result = "Divisible by 3";
        break;
      case 1:
        result = "Remainder 1";
        break;
      default:
        result = "Remainder 2";
        break;
    }

  } catch (error) {
    console.error("Error processing data:", error);
    return "Error occurred";
  } finally {
    console.log("Processing complete");
  }

  // Format the final sum using external utility
  const formattedSum = formatNumber(sum);
  return result + ` (sum: ${formattedSum})`;
}

export function simpleFunction(x: number): number {
  const result = x * 2;
  return result;
}