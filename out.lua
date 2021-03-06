local create_generic = (function(f) return (function(_) return (f)(_) end) end)
local _create_array = (function(_) return {  } end)
local create_array = (create_generic)(_create_array)
local a = (create_array)(nil)
