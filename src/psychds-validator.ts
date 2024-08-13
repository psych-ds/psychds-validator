import { main } from './main.ts';

export async function run(args: string[] = []) {
    try {
        await main(args);
    } catch (error) {
        console.error('An error occurred:', error);
        if (typeof process !== 'undefined') {
            process.exit(1);
        } else {
            Deno.exit(1);
        }
    }
}

if (import.meta.main) {
    run(Deno.args);
}