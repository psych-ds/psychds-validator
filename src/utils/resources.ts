
//Utility function for when testing encounters unclosed filestreams
//TODO: learn to make these close automatically
export function closeResources(){
    for(const key of Object.keys(Deno.resources())){
        if (parseInt(key) > 2)
          Deno.close(parseInt(key))
      }
}
